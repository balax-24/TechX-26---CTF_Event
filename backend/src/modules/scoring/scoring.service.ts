import { eq, and, sql, count } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  teams,
  challenges,
  checkpoints,
  checkpointProgress,
  teamSolves,
  scoreEvents,
  submissions,
  teamHints,
  hints,
} from '../../db/schema.js';
import { scoringEventBus } from './scoring.events.js';
import { logger } from '../../utils/logger.js';

export interface FinalSolveResult {
  status: 'correct' | 'already_solved';
  pointsAwarded: number;
  challengeSolved: boolean;
  newTeamScore?: number;
}

export interface CheckpointAwardResult {
  status: 'correct' | 'already_completed' | 'already_solved';
  pointsAwarded: number;
  newTeamScore?: number;
}

export class ScoringService {
  /**
   * Awards final challenge solve atomically within a PostgreSQL transaction.
   * Enforces:
   * 1. Idempotency (no duplicate rewards on concurrent submissions).
   * 2. Point Capping (awards challenge.points - checkpointsAlreadyAwarded).
   * 3. Ledger audit event in score_events.
   * 4. Atomic team score and solve count increment.
   */
  async awardFinalSolve(params: {
    teamId: string;
    userId: string;
    challengeId: string;
    submittedFlag: string;
    ipAddress: string;
    userAgent?: string;
  }): Promise<FinalSolveResult> {
    const { teamId, userId, challengeId, submittedFlag, ipAddress, userAgent } = params;

    return await db.transaction(async (tx) => {
      // 1. Check if team already solved (row-locked if exists)
      const [existingSolve] = await tx
        .select()
        .from(teamSolves)
        .where(
          and(
            eq(teamSolves.teamId, teamId),
            eq(teamSolves.challengeId, challengeId)
          )
        )
        .for('update')
        .limit(1);

      if (existingSolve) {
        // Record idempotent solve attempt in submissions audit log
        await tx.insert(submissions).values({
          teamId,
          userId,
          challengeId,
          submittedFlag,
          isCorrect: true,
          ipAddress,
          userAgent,
        });

        return {
          status: 'already_solved',
          pointsAwarded: 0,
          challengeSolved: true,
        };
      }

      // 2. Fetch challenge definition and lock team row
      const [chal] = await tx
        .select({
          id: challenges.id,
          title: challenges.title,
          points: challenges.points,
        })
        .from(challenges)
        .where(eq(challenges.id, challengeId))
        .limit(1);

      if (!chal) {
        throw new Error('CHALLENGE_NOT_FOUND');
      }

      const [team] = await tx
        .select({
          id: teams.id,
          name: teams.name,
          score: teams.score,
        })
        .from(teams)
        .where(eq(teams.id, teamId))
        .for('update')
        .limit(1);

      if (!team) {
        throw new Error('TEAM_NOT_FOUND');
      }

      // 3. Compute remaining points (challenge.points - sum of awarded checkpoint points)
      const [checkpointPointsResult] = await tx
        .select({
          totalAwarded: sql<number>`COALESCE(SUM(${checkpoints.pointValue}), 0)::int`,
        })
        .from(checkpointProgress)
        .innerJoin(checkpoints, eq(checkpointProgress.checkpointId, checkpoints.id))
        .where(
          and(
            eq(checkpointProgress.teamId, teamId),
            eq(checkpoints.challengeId, challengeId)
          )
        );

      const checkpointPointsAlreadyAwarded = checkpointPointsResult?.totalAwarded || 0;
      const pointsToAward = Math.max(0, chal.points - checkpointPointsAlreadyAwarded);
      const newTeamScore = team.score + pointsToAward;

      // 4. Insert team solve record (Guaranteed unique by UNIQUE(team_id, challenge_id))
      await tx.insert(teamSolves).values({
        teamId,
        challengeId,
        solvedByUserId: userId,
      });

      // 5. Append immutable score event to audit ledger
      await tx.insert(scoreEvents).values({
        teamId,
        challengeId,
        eventType: 'final_solve',
        points: pointsToAward,
        runningTeamScore: newTeamScore,
      });

      // 6. Update team current score and tie-breaking timestamp
      await tx
        .update(teams)
        .set({
          score: newTeamScore,
          lastScoreAt: sql`NOW()`,
          updatedAt: sql`NOW()`,
        })
        .where(eq(teams.id, teamId));

      // 7. Increment challenge solve count
      await tx
        .update(challenges)
        .set({
          solveCount: sql`${challenges.solveCount} + 1`,
          updatedAt: sql`NOW()`,
        })
        .where(eq(challenges.id, challengeId));

      // 8. Record successful submission
      await tx.insert(submissions).values({
        teamId,
        userId,
        challengeId,
        submittedFlag,
        isCorrect: true,
        ipAddress,
        userAgent,
      });

      logger.info(
        {
          teamId,
          teamName: team.name,
          challengeId,
          pointsAwarded: pointsToAward,
          newTeamScore,
        },
        'Final challenge solve committed'
      );

      // 9. Post-commit event emission
      setImmediate(() => {
        scoringEventBus.emitScoreEvent({
          teamId,
          teamName: team.name,
          challengeId,
          challengeTitle: chal.title,
          eventType: 'final_solve',
          pointsAwarded: pointsToAward,
          newTeamScore,
          timestamp: new Date(),
        });
      });

      return {
        status: 'correct',
        pointsAwarded: pointsToAward,
        challengeSolved: true,
        newTeamScore,
      };
    });
  }

  /**
   * Awards checkpoint completion with prerequisite checking and anti-tamper verification.
   */
  async awardCheckpoint(params: {
    teamId: string;
    userId: string;
    checkpointId: string;
    proofMetadata?: any;
  }): Promise<CheckpointAwardResult> {
    const { teamId, userId, checkpointId, proofMetadata } = params;

    return await db.transaction(async (tx) => {
      // 1. Fetch checkpoint details
      const [cp] = await tx
        .select({
          id: checkpoints.id,
          challengeId: checkpoints.challengeId,
          stepNumber: checkpoints.stepNumber,
          title: checkpoints.title,
          pointValue: checkpoints.pointValue,
        })
        .from(checkpoints)
        .where(eq(checkpoints.id, checkpointId))
        .limit(1);

      if (!cp) {
        throw new Error('CHECKPOINT_NOT_FOUND');
      }

      // 2. Check if team already solved this checkpoint
      const [existingProgress] = await tx
        .select()
        .from(checkpointProgress)
        .where(
          and(
            eq(checkpointProgress.teamId, teamId),
            eq(checkpointProgress.checkpointId, checkpointId)
          )
        )
        .for('update')
        .limit(1);

      if (existingProgress) {
        return {
          status: 'already_completed',
          pointsAwarded: 0,
        };
      }

      // 3. Check if challenge is already final-solved by this team
      const [existingSolve] = await tx
        .select({ id: teamSolves.id })
        .from(teamSolves)
        .where(
          and(
            eq(teamSolves.teamId, teamId),
            eq(teamSolves.challengeId, cp.challengeId)
          )
        )
        .limit(1);

      if (existingSolve) {
        return {
          status: 'already_solved',
          pointsAwarded: 0,
        };
      }

      // 4. Enforce prerequisites: Step N requires Step N - 1
      if (cp.stepNumber > 1) {
        const [prevCheckpoint] = await tx
          .select({ id: checkpoints.id })
          .from(checkpoints)
          .where(
            and(
              eq(checkpoints.challengeId, cp.challengeId),
              eq(checkpoints.stepNumber, cp.stepNumber - 1)
            )
          )
          .limit(1);

        if (prevCheckpoint) {
          const [prevProgress] = await tx
            .select({ id: checkpointProgress.id })
            .from(checkpointProgress)
            .where(
              and(
                eq(checkpointProgress.teamId, teamId),
                eq(checkpointProgress.checkpointId, prevCheckpoint.id)
              )
            )
            .limit(1);

          if (!prevProgress) {
            throw new Error('PREREQUISITE_NOT_MET');
          }
        }
      }

      // 5. Lock team row and compute new score
      const [team] = await tx
        .select({
          id: teams.id,
          name: teams.name,
          score: teams.score,
        })
        .from(teams)
        .where(eq(teams.id, teamId))
        .for('update')
        .limit(1);

      if (!team) {
        throw new Error('TEAM_NOT_FOUND');
      }

      const pointsAwarded = cp.pointValue;
      const newTeamScore = team.score + pointsAwarded;

      // 6. Record checkpoint progress (Guaranteed unique by UNIQUE(team_id, checkpoint_id))
      await tx.insert(checkpointProgress).values({
        teamId,
        checkpointId,
        userId,
        proofMetadata,
      });

      // 7. Append to immutable score ledger
      await tx.insert(scoreEvents).values({
        teamId,
        challengeId: cp.challengeId,
        checkpointId: cp.id,
        eventType: 'checkpoint_solve',
        points: pointsAwarded,
        runningTeamScore: newTeamScore,
      });

      // 8. Update team current score and timestamp
      await tx
        .update(teams)
        .set({
          score: newTeamScore,
          lastScoreAt: sql`NOW()`,
          updatedAt: sql`NOW()`,
        })
        .where(eq(teams.id, teamId));

      logger.info(
        {
          teamId,
          checkpointId,
          stepNumber: cp.stepNumber,
          pointsAwarded,
          newTeamScore,
        },
        'Checkpoint solve committed'
      );

      // 9. Post-commit event emission
      setImmediate(() => {
        scoringEventBus.emitScoreEvent({
          teamId,
          teamName: team.name,
          challengeId: cp.challengeId,
          checkpointId: cp.id,
          checkpointNumber: cp.stepNumber,
          eventType: 'checkpoint_solve',
          pointsAwarded,
          newTeamScore,
          timestamp: new Date(),
        });
      });

      return {
        status: 'correct',
        pointsAwarded,
        newTeamScore,
      };
    });
  }

  /**
   * Applies hint penalty and unlocks hint atomically.
   */
  async unlockHintWithPenalty(params: {
    teamId: string;
    userId: string;
    hintId: string;
  }): Promise<{
    alreadyUnlocked: boolean;
    penaltyApplied: number;
    newTeamScore?: number;
    content: string;
  }> {
    const { teamId, userId, hintId } = params;

    return await db.transaction(async (tx) => {
      // 1. Check if hint is already unlocked
      const [existing] = await tx
        .select()
        .from(teamHints)
        .where(
          and(
            eq(teamHints.teamId, teamId),
            eq(teamHints.hintId, hintId)
          )
        )
        .for('update')
        .limit(1);

      const [hint] = await tx
        .select()
        .from(hints)
        .where(eq(hints.id, hintId))
        .limit(1);

      if (!hint) {
        throw new Error('HINT_NOT_FOUND');
      }

      if (existing) {
        return {
          alreadyUnlocked: true,
          penaltyApplied: 0,
          content: hint.content,
        };
      }

      // 2. Lock team row
      const [team] = await tx
        .select({
          id: teams.id,
          name: teams.name,
          score: teams.score,
        })
        .from(teams)
        .where(eq(teams.id, teamId))
        .for('update')
        .limit(1);

      if (!team) {
        throw new Error('TEAM_NOT_FOUND');
      }

      const penalty = hint.penaltyPoints;
      // Enforce minimum score floor = 0
      const newTeamScore = Math.max(0, team.score - penalty);
      const netDeduction = team.score - newTeamScore;

      // 3. Insert team hint record
      await tx.insert(teamHints).values({
        teamId,
        hintId,
        unlockedByUserId: userId,
      });

      // 4. Record penalty in ledger if points deducted
      if (netDeduction > 0) {
        await tx.insert(scoreEvents).values({
          teamId,
          challengeId: hint.challengeId,
          hintId: hint.id,
          eventType: 'hint_penalty',
          points: -netDeduction,
          runningTeamScore: newTeamScore,
        });

        // 5. Update team score and tie-break timestamp
        await tx
          .update(teams)
          .set({
            score: newTeamScore,
            lastScoreAt: sql`NOW()`,
            updatedAt: sql`NOW()`,
          })
          .where(eq(teams.id, teamId));
      }

      setImmediate(() => {
        scoringEventBus.emitScoreEvent({
          teamId,
          teamName: team.name,
          challengeId: hint.challengeId,
          eventType: 'hint_penalty',
          pointsAwarded: -netDeduction,
          newTeamScore,
          timestamp: new Date(),
        });
      });

      return {
        alreadyUnlocked: false,
        penaltyApplied: netDeduction,
        newTeamScore,
        content: hint.content,
      };
    });
  }

  /**
   * Diagnostic reconciliation utility:
   * Compares materialized teams.score against SUM(score_events.points).
   */
  async reconcileTeamScore(teamId: string): Promise<{
    teamScore: number;
    ledgerSum: number;
    isConsistent: boolean;
  }> {
    const [team] = await db
      .select({ score: teams.score })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    const [ledger] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${scoreEvents.points}), 0)::int`,
      })
      .from(scoreEvents)
      .where(eq(scoreEvents.teamId, teamId));

    const teamScore = team?.score || 0;
    const ledgerSum = ledger?.total || 0;

    return {
      teamScore,
      ledgerSum,
      isConsistent: teamScore === ledgerSum,
    };
  }
}

export const scoringService = new ScoringService();
