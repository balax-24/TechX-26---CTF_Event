import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { challenges, submissions, teams } from '../../db/schema.js';
import { verifyFlag } from '../../utils/flags.js';
import { scoringService, FinalSolveResult } from '../scoring/scoring.service.js';
import { SubmitFlagInput } from './submissions.schema.js';
import { competitionService } from '../competition/competition.service.js';

export interface SubmissionResponse {
  status: 'correct' | 'incorrect' | 'already_solved';
  pointsAwarded?: number;
  challengeSolved?: boolean;
  newTeamScore?: number;
}

export class SubmissionsService {
  /**
   * Evaluates flag submission, audits attempt, and invokes atomic scoring engine if correct.
   */
  async submitFlag(params: {
    userId: string;
    teamId: string;
    input: SubmitFlagInput;
    ipAddress: string;
    userAgent?: string;
    isAdmin?: boolean;
  }): Promise<SubmissionResponse> {
    const { userId, teamId, input, ipAddress, userAgent, isAdmin = false } = params;

    // 0. Prohibit administrator participation through normal flag submission
    if (isAdmin) {
      throw new Error('ADMIN_PARTICIPATION_FORBIDDEN');
    }

    // 1. Verify Competition State
    await competitionService.requireLiveCompetition();

    // 2. Verify Team Status (Active check)
    const [team] = await db
      .select({ id: teams.id, status: teams.status })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    if (!team) {
      throw new Error('TEAM_NOT_FOUND');
    }
    if (team.status === 'disqualified') {
      throw new Error('TEAM_DISQUALIFIED');
    }
    if (team.status !== 'active') {
      throw new Error('TEAM_DISABLED');
    }

    // 3. Fetch challenge definition
    const conditions = [
      eq(challenges.slug, input.challengeSlug),
      eq(challenges.status, 'published'),
      sql`(${challenges.releaseTime} IS NULL OR ${challenges.releaseTime} <= NOW())`,
    ];

    const [chal] = await db
      .select({
        id: challenges.id,
        flagHash: challenges.flagHash,
        isDynamicHmac: challenges.isDynamicHmac,
      })
      .from(challenges)
      .where(and(...conditions))
      .limit(1);

    if (!chal) {
      throw new Error('CHALLENGE_NOT_FOUND');
    }

    // 3. Verify submitted flag using constant-time evaluation
    const isCorrect = verifyFlag(input.flag, chal.flagHash, {
      isDynamicHmac: chal.isDynamicHmac,
      hmacSecret: chal.flagHash,
      teamId,
    });

    if (!isCorrect) {
      // Audit incorrect attempt in submissions table
      await db.insert(submissions).values({
        teamId,
        userId,
        challengeId: chal.id,
        submittedFlag: input.flag,
        isCorrect: false,
        ipAddress,
        userAgent,
      });

      return { status: 'incorrect' };
    }

    // 4. Correct flag: delegate to atomic scoring engine
    const solveResult: FinalSolveResult = await scoringService.awardFinalSolve({
      teamId,
      userId,
      challengeId: chal.id,
      submittedFlag: input.flag,
      ipAddress,
      userAgent,
    });

    return solveResult;
  }
}

export const submissionsService = new SubmissionsService();
