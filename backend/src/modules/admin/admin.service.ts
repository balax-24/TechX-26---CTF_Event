import { eq, and, or, ne, sql, desc, count, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  challenges,
  checkpoints,
  checkpointProgress,
  hints,
  teamHints,
  categories,
  teams,
  teamMembers,
  users,
  scoreEvents,
  teamSolves,
  submissions,
  announcements,
  competitionState,
  scoreEventOutbox,
  challengeFiles,
  auditLogs,
  challengeInstances,
} from '../../db/schema.js';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
import { hashFlag } from '../../utils/flags.js';
import { hashPassword } from '../../utils/crypto.js';
import { auditService } from './audit.service.js';
import {
  CreateChallengeAdminInput,
  UpdateChallengeAdminInput,
  CreateCheckpointAdminInput,
  UpdateCheckpointAdminInput,
  CreateHintAdminInput,
  PaginationQuery,
  CreateTeamAdminInput,
  AddTeamMemberAdminInput,
  CreateParticipantAdminInput,
  ResetPasswordAdminInput,
  PatchUserAdminInput,
  ProvisionTeamWithParticipantInput,
  provisionTeamWithParticipantSchema,
  deriveUsernameFromEmail,
  isTestAccount,
} from './admin.schema.js';
import { getChallengeGatewayClient } from '../dynamic_challenges/challenge_gateway.client.js';
import { leaderboardService } from '../leaderboard/leaderboard.service.js';
import { getRedisClient } from '../../cache/redis.js';
import { REDIS_LEADERBOARD_CHANNEL } from '../realtime/realtime.constants.js';
import { logger } from '../../utils/logger.js';

/**
 * Authoritatively inspects whether a challenge has historical scoring activity, solves, or checkpoint progress.
 * Queries persisted tables (teamSolves, scoreEvents, checkpointProgress, challenges) directly.
 */
export async function checkChallengeHistoricalActivity(tx: any, challengeId: string): Promise<boolean> {
  const [solves] = await tx
    .select({ count: count() })
    .from(teamSolves)
    .where(eq(teamSolves.challengeId, challengeId));

  const [scoreEvs] = await tx
    .select({ count: count() })
    .from(scoreEvents)
    .where(eq(scoreEvents.challengeId, challengeId));

  const [cpProg] = await tx
    .select({ count: count() })
    .from(checkpointProgress)
    .innerJoin(checkpoints, eq(checkpointProgress.checkpointId, checkpoints.id))
    .where(eq(checkpoints.challengeId, challengeId));

  const [chal] = await tx
    .select({ solveCount: challenges.solveCount })
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .limit(1);

  return (
    (solves?.count || 0) > 0 ||
    (scoreEvs?.count || 0) > 0 ||
    (cpProg?.count || 0) > 0 ||
    (chal?.solveCount || 0) > 0
  );
}

export class AdminService {
  // ---------------------------------------------------------------------------
  // 1. CHALLENGE ADMINISTRATION
  // ---------------------------------------------------------------------------

  async listChallenges(params?: PaginationQuery): Promise<any[]> {
    const page = Math.max(1, params?.page || 1);
    const limit = Math.min(100, Math.max(1, params?.limit || 50));
    const offset = (page - 1) * limit;

    const chalList = await db
      .select({
        id: challenges.id,
        slug: challenges.slug,
        title: challenges.title,
        description: challenges.description,
        difficulty: challenges.difficulty,
        points: challenges.points,
        status: challenges.status,
        releaseTime: challenges.releaseTime,
        maxAttempts: challenges.maxAttempts,
        author: challenges.author,
        solveCount: challenges.solveCount,
        categoryName: categories.name,
        categorySlug: categories.slug,
        createdAt: challenges.createdAt,
      })
      .from(challenges)
      .innerJoin(categories, eq(challenges.categoryId, categories.id))
      .orderBy(desc(challenges.createdAt), challenges.id)
      .limit(limit)
      .offset(offset);

    return chalList;
  }

  async getChallenge(id: string): Promise<any> {
    const [chal] = await db
      .select({
        id: challenges.id,
        slug: challenges.slug,
        title: challenges.title,
        description: challenges.description,
        story: challenges.story,
        difficulty: challenges.difficulty,
        points: challenges.points,
        isDynamicHmac: challenges.isDynamicHmac,
        status: challenges.status,
        releaseTime: challenges.releaseTime,
        maxAttempts: challenges.maxAttempts,
        author: challenges.author,
        connectionInfo: challenges.connectionInfo,
        solveCount: challenges.solveCount,
        categoryId: challenges.categoryId,
        categoryName: categories.name,
        createdAt: challenges.createdAt,
        updatedAt: challenges.updatedAt,
      })
      .from(challenges)
      .innerJoin(categories, eq(challenges.categoryId, categories.id))
      .where(eq(challenges.id, id))
      .limit(1);

    if (!chal) {
      throw new Error('CHALLENGE_NOT_FOUND');
    }

    const [chalCheckpoints, chalHints] = await Promise.all([
      db
        .select({
          id: checkpoints.id,
          stepNumber: checkpoints.stepNumber,
          title: checkpoints.title,
          description: checkpoints.description,
          pointValue: checkpoints.pointValue,
          validationType: checkpoints.validationType,
          createdAt: checkpoints.createdAt,
        })
        .from(checkpoints)
        .where(eq(checkpoints.challengeId, id))
        .orderBy(checkpoints.stepNumber),
      db
        .select({
          id: hints.id,
          orderNumber: hints.orderNumber,
          content: hints.content,
          penaltyPoints: hints.penaltyPoints,
          createdAt: hints.createdAt,
        })
        .from(hints)
        .where(eq(hints.challengeId, id))
        .orderBy(hints.orderNumber),
    ]);

    return {
      ...chal,
      hasFlag: true, // Flag secret is never serialized in responses
      checkpoints: chalCheckpoints,
      hints: chalHints,
    };
  }

  async createChallenge(
    input: CreateChallengeAdminInput,
    actor: { id: string; role: string; ip: string; requestId?: string }
  ): Promise<any> {
    const flagHash = hashFlag(input.flag);

    return await db.transaction(async (tx) => {
      const [newChal] = await tx
        .insert(challenges)
        .values({
          title: input.title,
          slug: input.slug,
          categoryId: input.categoryId,
          description: input.description,
          story: input.story ?? null,
          difficulty: input.difficulty,
          points: input.points,
          flagHash,
          isDynamicHmac: input.isDynamicHmac ?? false,
          status: input.status ?? 'draft',
          releaseTime: input.releaseTime ? new Date(input.releaseTime) : null,
          maxAttempts: input.maxAttempts ?? null,
          author: input.author,
          connectionInfo: input.connectionInfo ?? null,
        })
        .returning();

      await auditService.record(
        {
          actorId: actor.id,
          actorRole: actor.role,
          actorIp: actor.ip,
          action: 'CHALLENGE_CREATE',
          entityType: 'challenge',
          entityId: newChal.id,
          newState: { slug: newChal.slug, points: newChal.points, status: newChal.status },
          requestId: actor.requestId,
        },
        tx
      );

      return {
        id: newChal.id,
        slug: newChal.slug,
        title: newChal.title,
        points: newChal.points,
        status: newChal.status,
      };
    });
  }

  async updateChallenge(
    id: string,
    input: UpdateChallengeAdminInput,
    actor: { id: string; role: string; ip: string; requestId?: string }
  ): Promise<any> {
    return await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(challenges)
        .where(eq(challenges.id, id))
        .for('update');

      if (!current) {
        throw new Error('CHALLENGE_NOT_FOUND');
      }

      // Check authoritatively if challenge has historical scoring activity (solves, ledger events, or checkpoint progress)
      const hasActivity = await checkChallengeHistoricalActivity(tx, id);

      // IMMUTABILITY RULE: Freeze scoring-critical properties if historical activity exists
      if (hasActivity) {
        if (input.points !== undefined && input.points !== current.points) {
          throw new Error(
            'CHALLENGE_LOCKED_FOR_SCORING: Cannot modify points on a challenge with active solves or scoring events. Use administrative score adjustments instead.'
          );
        }
        if (input.flag !== undefined) {
          throw new Error(
            'CHALLENGE_LOCKED_FOR_SCORING: Cannot alter flag secret on an active challenge with recorded solves.'
          );
        }
      }

      // Point Validation Invariant: sum(checkpoint points) <= challenge.points
      if (input.points !== undefined) {
        const [cpSum] = await tx
          .select({
            total: sql<number>`COALESCE(SUM(${checkpoints.pointValue}), 0)::int`,
          })
          .from(checkpoints)
          .where(eq(checkpoints.challengeId, id));

        if ((cpSum?.total || 0) > input.points) {
          throw new Error(
            `INVALID_POINTS: Challenge points (${input.points}) cannot be less than total checkpoint points (${cpSum?.total})`
          );
        }
      }

      const updateData: any = {
        updatedAt: sql`NOW()`,
      };

      if (input.title !== undefined) updateData.title = input.title;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.story !== undefined) updateData.story = input.story;
      if (input.difficulty !== undefined) updateData.difficulty = input.difficulty;
      if (input.points !== undefined) updateData.points = input.points;
      if (input.status !== undefined) updateData.status = input.status;
      if (input.releaseTime !== undefined)
        updateData.releaseTime = input.releaseTime ? new Date(input.releaseTime) : null;
      if (input.maxAttempts !== undefined) updateData.maxAttempts = input.maxAttempts;
      if (input.author !== undefined) updateData.author = input.author;
      if (input.connectionInfo !== undefined) updateData.connectionInfo = input.connectionInfo;
      if (input.flag !== undefined) updateData.flagHash = hashFlag(input.flag);

      const [updated] = await tx
        .update(challenges)
        .set(updateData)
        .where(eq(challenges.id, id))
        .returning();

      await auditService.record(
        {
          actorId: actor.id,
          actorRole: actor.role,
          actorIp: actor.ip,
          action: 'CHALLENGE_UPDATE',
          entityType: 'challenge',
          entityId: id,
          previousState: { points: current.points, status: current.status, title: current.title },
          newState: { points: updated.points, status: updated.status, title: updated.title },
          requestId: actor.requestId,
        },
        tx
      );

      return {
        id: updated.id,
        slug: updated.slug,
        title: updated.title,
        points: updated.points,
        status: updated.status,
      };
    });
  }

  async addCheckpoint(
    challengeId: string,
    input: CreateCheckpointAdminInput,
    actor: { id: string; role: string; ip: string; requestId?: string }
  ): Promise<any> {
    return await db.transaction(async (tx) => {
      const [chal] = await tx
        .select()
        .from(challenges)
        .where(eq(challenges.id, challengeId))
        .for('update');

      if (!chal) {
        throw new Error('CHALLENGE_NOT_FOUND');
      }

      const hasActivity = await checkChallengeHistoricalActivity(tx, challengeId);
      if (hasActivity) {
        throw new Error(
          'CHALLENGE_LOCKED_FOR_SCORING: Cannot add checkpoints to a challenge with active solves or scoring events'
        );
      }

      // Check sum(checkpoints) + new pointValue <= chal.points
      const [currentCpSum] = await tx
        .select({
          total: sql<number>`COALESCE(SUM(${checkpoints.pointValue}), 0)::int`,
        })
        .from(checkpoints)
        .where(eq(checkpoints.challengeId, challengeId));

      const newTotal = (currentCpSum?.total || 0) + input.pointValue;
      if (newTotal > chal.points) {
        throw new Error(
          `INVALID_CHECKPOINT_POINTS: Total checkpoint points (${newTotal}) exceeds challenge point value (${chal.points})`
        );
      }

      const proofHash = hashFlag(input.secretProof);

      const [newCp] = await tx
        .insert(checkpoints)
        .values({
          challengeId,
          stepNumber: input.stepNumber,
          title: input.title,
          description: input.description,
          pointValue: input.pointValue,
          validationType: input.validationType,
          secretProofHash: proofHash,
        })
        .returning();

      await auditService.record(
        {
          actorId: actor.id,
          actorRole: actor.role,
          actorIp: actor.ip,
          action: 'CHECKPOINT_CREATE',
          entityType: 'checkpoint',
          entityId: newCp.id,
          newState: { stepNumber: newCp.stepNumber, pointValue: newCp.pointValue },
          requestId: actor.requestId,
        },
        tx
      );

      return {
        id: newCp.id,
        stepNumber: newCp.stepNumber,
        title: newCp.title,
        pointValue: newCp.pointValue,
      };
    });
  }

  async updateCheckpoint(
    challengeId: string,
    checkpointId: string,
    input: UpdateCheckpointAdminInput,
    actor: { id: string; role: string; ip: string; requestId?: string }
  ): Promise<any> {
    return await db.transaction(async (tx) => {
      const [chal] = await tx
        .select()
        .from(challenges)
        .where(eq(challenges.id, challengeId))
        .for('update');

      if (!chal) {
        throw new Error('CHALLENGE_NOT_FOUND');
      }

      const [currentCp] = await tx
        .select()
        .from(checkpoints)
        .where(and(eq(checkpoints.id, checkpointId), eq(checkpoints.challengeId, challengeId)))
        .for('update');

      if (!currentCp) {
        throw new Error('CHECKPOINT_NOT_FOUND');
      }

      // Check authoritative historical activity for this checkpoint / challenge
      const [cpProg] = await tx
        .select({ count: count() })
        .from(checkpointProgress)
        .where(eq(checkpointProgress.checkpointId, checkpointId));

      const hasHistory = (cpProg?.count || 0) > 0 || (await checkChallengeHistoricalActivity(tx, challengeId));

      // IMMUTABILITY: If historical activity exists, scoring-critical properties are locked
      if (hasHistory) {
        if (input.pointValue !== undefined && input.pointValue !== currentCp.pointValue) {
          throw new Error(
            'CHALLENGE_LOCKED_FOR_SCORING: Cannot modify checkpoint points after historical scoring activity has been recorded'
          );
        }
        if (input.stepNumber !== undefined && input.stepNumber !== currentCp.stepNumber) {
          throw new Error(
            'CHALLENGE_LOCKED_FOR_SCORING: Cannot reorder or change step number after historical progress exists'
          );
        }
        if (input.validationType !== undefined && input.validationType !== currentCp.validationType) {
          throw new Error(
            'CHALLENGE_LOCKED_FOR_SCORING: Cannot modify validation type after historical activity exists'
          );
        }
        if (input.secretProof !== undefined) {
          throw new Error(
            'CHALLENGE_LOCKED_FOR_SCORING: Cannot alter secret proof on a checkpoint with recorded history'
          );
        }
      }

      // Check sum(checkpoints) <= challenge.points invariant
      if (input.pointValue !== undefined && input.pointValue !== currentCp.pointValue) {
        const [otherCps] = await tx
          .select({
            total: sql<number>`COALESCE(SUM(${checkpoints.pointValue}), 0)::int`,
          })
          .from(checkpoints)
          .where(and(eq(checkpoints.challengeId, challengeId), ne(checkpoints.id, checkpointId)));

        const newTotal = (otherCps?.total || 0) + input.pointValue;
        if (newTotal > chal.points) {
          throw new Error(
            `INVALID_CHECKPOINT_POINTS: Total checkpoint points (${newTotal}) exceeds challenge point value (${chal.points})`
          );
        }
      }

      const updateData: any = {};
      if (input.stepNumber !== undefined) updateData.stepNumber = input.stepNumber;
      if (input.title !== undefined) updateData.title = input.title;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.pointValue !== undefined) updateData.pointValue = input.pointValue;
      if (input.validationType !== undefined) updateData.validationType = input.validationType;
      if (input.secretProof !== undefined) updateData.secretProofHash = hashFlag(input.secretProof);

      const [updated] = await tx
        .update(checkpoints)
        .set(updateData)
        .where(eq(checkpoints.id, checkpointId))
        .returning();

      await auditService.record(
        {
          actorId: actor.id,
          actorRole: actor.role,
          actorIp: actor.ip,
          action: 'CHECKPOINT_UPDATE',
          entityType: 'checkpoint',
          entityId: checkpointId,
          previousState: {
            stepNumber: currentCp.stepNumber,
            pointValue: currentCp.pointValue,
            title: currentCp.title,
          },
          newState: {
            stepNumber: updated.stepNumber,
            pointValue: updated.pointValue,
            title: updated.title,
          },
          requestId: actor.requestId,
        },
        tx
      );

      return {
        id: updated.id,
        stepNumber: updated.stepNumber,
        title: updated.title,
        pointValue: updated.pointValue,
      };
    });
  }

  async deleteCheckpoint(
    challengeId: string,
    checkpointId: string,
    actor: { id: string; role: string; ip: string; requestId?: string }
  ): Promise<{ success: true; message: string }> {
    return await db.transaction(async (tx) => {
      const [chal] = await tx
        .select()
        .from(challenges)
        .where(eq(challenges.id, challengeId))
        .for('update');

      if (!chal) {
        throw new Error('CHALLENGE_NOT_FOUND');
      }

      const [currentCp] = await tx
        .select()
        .from(checkpoints)
        .where(and(eq(checkpoints.id, checkpointId), eq(checkpoints.challengeId, challengeId)))
        .for('update');

      if (!currentCp) {
        throw new Error('CHECKPOINT_NOT_FOUND');
      }

      // Check authoritative historical activity for this checkpoint / challenge
      const [cpProg] = await tx
        .select({ count: count() })
        .from(checkpointProgress)
        .where(eq(checkpointProgress.checkpointId, checkpointId));

      const hasHistory = (cpProg?.count || 0) > 0 || (await checkChallengeHistoricalActivity(tx, challengeId));

      if (hasHistory) {
        throw new Error(
          'CHALLENGE_LOCKED_FOR_SCORING: Cannot delete checkpoint after historical progress or scoring events exist. Destructive deletion would corrupt historical scoring integrity.'
        );
      }

      await tx.delete(checkpoints).where(eq(checkpoints.id, checkpointId));

      await auditService.record(
        {
          actorId: actor.id,
          actorRole: actor.role,
          actorIp: actor.ip,
          action: 'CHECKPOINT_DELETE',
          entityType: 'checkpoint',
          entityId: checkpointId,
          previousState: {
            challengeId,
            stepNumber: currentCp.stepNumber,
            title: currentCp.title,
            pointValue: currentCp.pointValue,
          },
          requestId: actor.requestId,
        },
        tx
      );

      return { success: true, message: 'Checkpoint deleted successfully' };
    });
  }

  async addHint(
    challengeId: string,
    input: CreateHintAdminInput,
    actor: { id: string; role: string; ip: string; requestId?: string }
  ): Promise<any> {
    return await db.transaction(async (tx) => {
      const [chal] = await tx
        .select()
        .from(challenges)
        .where(eq(challenges.id, challengeId))
        .for('update');

      if (!chal) {
        throw new Error('CHALLENGE_NOT_FOUND');
      }

      const [newHint] = await tx
        .insert(hints)
        .values({
          challengeId,
          orderNumber: input.orderNumber,
          content: input.content,
          penaltyPoints: input.penaltyPoints,
        })
        .returning();

      await auditService.record(
        {
          actorId: actor.id,
          actorRole: actor.role,
          actorIp: actor.ip,
          action: 'HINT_CREATE',
          entityType: 'hint',
          entityId: newHint.id,
          newState: { orderNumber: newHint.orderNumber, penaltyPoints: newHint.penaltyPoints },
          requestId: actor.requestId,
        },
        tx
      );

      return newHint;
    });
  }

  // ---------------------------------------------------------------------------
  // 2. TEAM MODERATION
  // ---------------------------------------------------------------------------

  async listTeams(params?: PaginationQuery): Promise<any[]> {
    const page = Math.max(1, params?.page || 1);
    const limit = Math.min(100, Math.max(1, params?.limit || 50));
    const offset = (page - 1) * limit;

    const allTeams = await db
      .select({
        id: teams.id,
        name: teams.name,
        score: teams.score,
        status: teams.status,
        isBanned: teams.isBanned,
        createdAt: teams.createdAt,
        lastScoreAt: teams.lastScoreAt,
      })
      .from(teams)
      .orderBy(desc(teams.score), teams.lastScoreAt, teams.id)
      .limit(limit)
      .offset(offset);

    return allTeams;
  }

  async getTeam(id: string): Promise<any> {
    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, id))
      .limit(1);

    if (!team) {
      throw new Error('TEAM_NOT_FOUND');
    }

    const [members, solves, events] = await Promise.all([
      db
        .select({
          userId: users.id,
          username: users.username,
          email: users.email,
          role: teamMembers.role,
          joinedAt: teamMembers.joinedAt,
        })
        .from(teamMembers)
        .innerJoin(users, eq(teamMembers.userId, users.id))
        .where(eq(teamMembers.teamId, id)),
      db
        .select({
          challengeId: challenges.id,
          challengeTitle: challenges.title,
          solvedAt: teamSolves.solvedAt,
        })
        .from(teamSolves)
        .innerJoin(challenges, eq(teamSolves.challengeId, challenges.id))
        .where(eq(teamSolves.teamId, id)),
      db
        .select({
          id: scoreEvents.id,
          eventType: scoreEvents.eventType,
          points: scoreEvents.points,
          runningTeamScore: scoreEvents.runningTeamScore,
          createdAt: scoreEvents.createdAt,
        })
        .from(scoreEvents)
        .where(eq(scoreEvents.teamId, id))
        .orderBy(desc(scoreEvents.createdAt))
        .limit(50),
    ]);

    return {
      id: team.id,
      name: team.name,
      score: team.score,
      status: team.status,
      isBanned: team.isBanned,
      lastScoreAt: team.lastScoreAt,
      members,
      solves,
      recentScoreEvents: events,
    };
  }

  async setTeamStatus(
    teamId: string,
    status: 'active' | 'disabled' | 'disqualified',
    reason: string,
    actor: { id: string; role: string; ip: string; requestId?: string }
  ): Promise<any> {
    return await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(teams)
        .where(eq(teams.id, teamId))
        .for('update');

      if (!current) {
        throw new Error('TEAM_NOT_FOUND');
      }

      const isBanned = status === 'disabled' || status === 'disqualified';

      const [updated] = await tx
        .update(teams)
        .set({
          status,
          isBanned,
          updatedAt: sql`NOW()`,
        })
        .where(eq(teams.id, teamId))
        .returning();

      await auditService.record(
        {
          actorId: actor.id,
          actorRole: actor.role,
          actorIp: actor.ip,
          action: 'TEAM_STATUS_UPDATE',
          entityType: 'team',
          entityId: teamId,
          previousState: { status: current.status, isBanned: current.isBanned },
          newState: { status: updated.status, isBanned: updated.isBanned },
          reason,
          requestId: actor.requestId,
        },
        tx
      );

      return {
        id: updated.id,
        name: updated.name,
        status: updated.status,
        isBanned: updated.isBanned,
      };
    });
  }

  async renameTeam(
    teamId: string,
    newName: string,
    reason: string,
    actor: { id: string; role: string; ip: string; requestId?: string }
  ): Promise<any> {
    return await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(teams)
        .where(eq(teams.id, teamId))
        .for('update');

      if (!current) {
        throw new Error('TEAM_NOT_FOUND');
      }

      // Check name collision
      const [collision] = await tx
        .select({ id: teams.id })
        .from(teams)
        .where(and(sql`LOWER(${teams.name}) = LOWER(${newName})`, ne(teams.id, teamId)))
        .limit(1);

      if (collision) {
        throw new Error('TEAM_NAME_EXISTS');
      }

      const [updated] = await tx
        .update(teams)
        .set({
          name: newName,
          updatedAt: sql`NOW()`,
        })
        .where(eq(teams.id, teamId))
        .returning();

      await auditService.record(
        {
          actorId: actor.id,
          actorRole: actor.role,
          actorIp: actor.ip,
          action: 'TEAM_RENAME',
          entityType: 'team',
          entityId: teamId,
          previousState: { name: current.name },
          newState: { name: updated.name },
          reason,
          requestId: actor.requestId,
        },
        tx
      );

      return {
        id: updated.id,
        name: updated.name,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // 3. USER MODERATION
  // ---------------------------------------------------------------------------

  async listUsers(params?: PaginationQuery): Promise<any[]> {
    const page = Math.max(1, params?.page || 1);
    const limit = Math.min(100, Math.max(1, params?.limit || 50));
    const offset = (page - 1) * limit;

    const userList = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt), users.id)
      .limit(limit)
      .offset(offset);

    return userList;
  }

  async setUserActive(
    userId: string,
    isActive: boolean,
    reason: string,
    actor: { id: string; role: string; ip: string; requestId?: string }
  ): Promise<any> {
    return await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .for('update');

      if (!current) {
        throw new Error('USER_NOT_FOUND');
      }

      const [updated] = await tx
        .update(users)
        .set({
          isActive,
          updatedAt: sql`NOW()`,
        })
        .where(eq(users.id, userId))
        .returning();

      await auditService.record(
        {
          actorId: actor.id,
          actorRole: actor.role,
          actorIp: actor.ip,
          action: 'USER_STATUS_UPDATE',
          entityType: 'user',
          entityId: userId,
          previousState: { isActive: current.isActive },
          newState: { isActive: updated.isActive },
          reason,
          requestId: actor.requestId,
        },
        tx
      );

      return {
        id: updated.id,
        username: updated.username,
        isActive: updated.isActive,
      };
    });
  }

  async setUserRole(
    userId: string,
    newRole: 'participant' | 'admin' | 'superadmin',
    reason: string,
    actor: { id: string; role: string; ip: string; requestId?: string }
  ): Promise<any> {
    if (userId === actor.id && newRole !== 'superadmin') {
      throw new Error('CANNOT_DEMOTE_SELF: Superadmins cannot demote their own account');
    }

    return await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .for('update');

      if (!current) {
        throw new Error('USER_NOT_FOUND');
      }

      const [updated] = await tx
        .update(users)
        .set({
          role: newRole,
          updatedAt: sql`NOW()`,
        })
        .where(eq(users.id, userId))
        .returning();

      await auditService.record(
        {
          actorId: actor.id,
          actorRole: actor.role,
          actorIp: actor.ip,
          action: 'USER_ROLE_UPDATE',
          entityType: 'user',
          entityId: userId,
          previousState: { role: current.role },
          newState: { role: updated.role },
          reason,
          requestId: actor.requestId,
        },
        tx
      );

      return {
        id: updated.id,
        username: updated.username,
        role: updated.role,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // 4. TEAM & PARTICIPANT PROVISIONING (ADMIN-ONLY)
  // ---------------------------------------------------------------------------

  async createTeam(
    input: CreateTeamAdminInput,
    actor: { id: string; role: string; ip: string; requestId?: string }
  ): Promise<any> {
    return await db.transaction(async (tx) => {
      const normalizedName = input.name.trim();

      const [collision] = await tx
        .select({ id: teams.id })
        .from(teams)
        .where(sql`LOWER(${teams.name}) = LOWER(${normalizedName})`)
        .limit(1);

      if (collision) {
        throw new Error('TEAM_NAME_EXISTS');
      }

      let verifiedCaptainId: string | null = null;
      if (input.captainId) {
        const [captainUser] = await tx
          .select({ id: users.id, role: users.role })
          .from(users)
          .where(eq(users.id, input.captainId))
          .limit(1);

        if (!captainUser) {
          throw new Error('USER_NOT_FOUND');
        }

        const [existingMembership] = await tx
          .select({ id: teamMembers.id })
          .from(teamMembers)
          .where(eq(teamMembers.userId, input.captainId))
          .limit(1);

        if (existingMembership) {
          throw new Error('ALREADY_IN_TEAM');
        }

        verifiedCaptainId = captainUser.id;
      }

      const [newTeam] = await tx
        .insert(teams)
        .values({
          name: normalizedName,
          captainId: verifiedCaptainId,
          status: 'active',
          isBanned: false,
          score: 0,
        })
        .returning();

      if (verifiedCaptainId) {
        await tx.insert(teamMembers).values({
          teamId: newTeam.id,
          userId: verifiedCaptainId,
          role: 'captain',
        });
      }

      await auditService.record(
        {
          actorId: actor.id,
          actorRole: actor.role,
          actorIp: actor.ip,
          action: 'TEAM_CREATED',
          entityType: 'team',
          entityId: newTeam.id,
          previousState: null,
          newState: { name: newTeam.name, captainId: newTeam.captainId, status: newTeam.status },
          reason: input.reason || 'Admin team provisioning',
          requestId: actor.requestId,
        },
        tx
      );

      return {
        id: newTeam.id,
        name: newTeam.name,
        captainId: newTeam.captainId,
        score: newTeam.score,
        status: newTeam.status,
        isBanned: newTeam.isBanned,
        createdAt: newTeam.createdAt,
      };
    });
  }

  async provisionTeamWithParticipant(
    input: ProvisionTeamWithParticipantInput,
    actor: { id: string; role: string; ip: string; requestId?: string }
  ): Promise<{
    team: {
      id: string;
      name: string;
      status: string;
      createdAt: Date;
    };
    participant: {
      id: string;
      username: string;
      email: string;
      role: string;
      isActive: boolean;
      createdAt: Date;
    };
    membership: {
      id: string;
      teamId: string;
      userId: string;
      role: string;
      joinedAt: Date;
    };
  }> {
    const parseResult = provisionTeamWithParticipantSchema.safeParse(input);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      if (issue.path.includes('password')) {
        throw new Error('WEAK_PASSWORD');
      }
      if (issue.path.includes('email')) {
        throw new Error('INVALID_EMAIL');
      }
      if (issue.path.includes('teamName')) {
        throw new Error('INVALID_TEAM_NAME');
      }
      throw new Error(`VALIDATION_ERROR: ${issue.message}`);
    }

    const { teamName, email, password, reason } = parseResult.data;
    const normalizedTeamName = teamName.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const rawUsername = parseResult.data.username?.trim() || deriveUsernameFromEmail(normalizedEmail);

    if (
      rawUsername.length < 3 ||
      rawUsername.length > 50 ||
      !/^[a-zA-Z0-9_.-]+$/.test(rawUsername)
    ) {
      throw new Error('INVALID_DERIVED_USERNAME');
    }

    return await db.transaction(async (tx) => {
      // 1. Check team name collision (case-insensitive)
      const [teamCollision] = await tx
        .select({ id: teams.id, name: teams.name })
        .from(teams)
        .where(sql`LOWER(${teams.name}) = LOWER(${normalizedTeamName})`)
        .limit(1);

      if (teamCollision) {
        throw new Error('TEAM_NAME_EXISTS');
      }

      // 2. Check user collision (case-insensitive username or email)
      const [userCollision] = await tx
        .select({ id: users.id, username: users.username, email: users.email })
        .from(users)
        .where(
          or(
            sql`LOWER(${users.username}) = LOWER(${rawUsername})`,
            sql`LOWER(${users.email}) = LOWER(${normalizedEmail})`
          )
        )
        .limit(1);

      if (userCollision) {
        if (userCollision.username.toLowerCase() === rawUsername.toLowerCase()) {
          throw new Error('USERNAME_EXISTS');
        }
        throw new Error('EMAIL_EXISTS');
      }

      // 3. Hash password with OWASP Argon2id
      const passwordHash = await hashPassword(password);

      // 4. Create team (captainId initially null, updated with member)
      const [newTeam] = await tx
        .insert(teams)
        .values({
          name: normalizedTeamName,
          captainId: null,
          status: 'active',
          isBanned: false,
          score: 0,
        })
        .returning();

      // 5. Create participant user
      const [newUser] = await tx
        .insert(users)
        .values({
          username: rawUsername,
          email: normalizedEmail,
          passwordHash,
          role: 'participant',
          isActive: true,
        })
        .returning();

      // 6. Assign participant to team as captain
      const [newMember] = await tx
        .insert(teamMembers)
        .values({
          teamId: newTeam.id,
          userId: newUser.id,
          role: 'captain',
        })
        .returning();

      // 7. Update team captainId
      await tx
        .update(teams)
        .set({ captainId: newUser.id, updatedAt: sql`NOW()` })
        .where(eq(teams.id, newTeam.id));

      // 8. Write audit records in transaction
      const auditActorId =
        actor.id && actor.id !== '00000000-0000-0000-0000-000000000000' ? actor.id : null;

      await auditService.record(
        {
          actorId: auditActorId,
          actorRole: actor.role,
          actorIp: actor.ip,
          action: 'TEAM_CREATED',
          entityType: 'team',
          entityId: newTeam.id,
          previousState: null,
          newState: { name: newTeam.name, captainId: newUser.id, status: newTeam.status },
          reason: reason || 'One-click team provisioning',
          requestId: actor.requestId,
        },
        tx
      );

      await auditService.record(
        {
          actorId: auditActorId,
          actorRole: actor.role,
          actorIp: actor.ip,
          action: 'PARTICIPANT_USER_CREATED',
          entityType: 'user',
          entityId: newUser.id,
          previousState: null,
          newState: {
            username: newUser.username,
            email: newUser.email,
            role: newUser.role,
            teamId: newTeam.id,
            teamRole: 'captain',
          },
          reason: reason || 'One-click team provisioning',
          requestId: actor.requestId,
        },
        tx
      );

      await auditService.record(
        {
          actorId: auditActorId,
          actorRole: actor.role,
          actorIp: actor.ip,
          action: 'TEAM_MEMBER_ADDED',
          entityType: 'team_member',
          entityId: newMember.id,
          previousState: null,
          newState: { teamId: newTeam.id, userId: newUser.id, role: 'captain' },
          reason: reason || 'One-click team provisioning',
          requestId: actor.requestId,
        },
        tx
      );

      return {
        team: {
          id: newTeam.id,
          name: newTeam.name,
          status: newTeam.status,
          createdAt: newTeam.createdAt,
        },
        participant: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          role: newUser.role,
          isActive: newUser.isActive,
          createdAt: newUser.createdAt,
        },
        membership: {
          id: newMember.id,
          teamId: newMember.teamId,
          userId: newMember.userId,
          role: newMember.role,
          joinedAt: newMember.joinedAt,
        },
      };
    });
  }

  /**
   * Look up a test participant and their associated team by username.
   * Returns non-sensitive summary details for confirmation.
   * Rejects non-test accounts and participants with no team.
   */
  async lookupTestTeamByUsername(username: string): Promise<{
    username: string;
    teamName: string;
    teamId: string;
    userId: string;
    score: number;
    solves: number;
  }> {
    if (!username || typeof username !== 'string' || !username.trim()) {
      throw new Error('USER_NOT_FOUND');
    }

    const cleanUsername = username.trim();

    // 1. Find participant by username (case-insensitive)
    const [user] = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .where(sql`LOWER(${users.username}) = LOWER(${cleanUsername})`)
      .limit(1);

    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }

    // 2. Find team membership
    const [membership] = await db
      .select({
        teamId: teamMembers.teamId,
        role: teamMembers.role,
      })
      .from(teamMembers)
      .where(eq(teamMembers.userId, user.id))
      .limit(1);

    if (!membership || !membership.teamId) {
      throw new Error('USER_HAS_NO_TEAM');
    }

    // 3. Find associated team
    const [team] = await db
      .select({
        id: teams.id,
        name: teams.name,
        score: teams.score,
        status: teams.status,
        isBanned: teams.isBanned,
      })
      .from(teams)
      .where(eq(teams.id, membership.teamId))
      .limit(1);

    if (!team) {
      throw new Error('USER_HAS_NO_TEAM');
    }

    // 4. Strict test account safety gate (Part 5)
    if (!isTestAccount(user.username, team.name)) {
      throw new Error('NOT_A_TEST_ACCOUNT');
    }

    // 5. Query solve count for confirmation display
    const [solvesResult] = await db
      .select({ totalSolves: count() })
      .from(teamSolves)
      .where(eq(teamSolves.teamId, team.id));
    const solves = solvesResult?.totalSolves || 0;

    return {
      username: user.username,
      teamName: team.name,
      teamId: team.id,
      userId: user.id,
      score: team.score,
      solves,
    };
  }

  /**
   * Cleans up a test team and its test participant.
   * Atomically deletes database records, removes dynamic challenge resources,
   * records an audit event, updates the leaderboard, and verifies Redis state.
   */
  async cleanupTestTeamByUsername(
    username: string,
    confirmation: string,
    actor: { id: string; role: string; ip: string; requestId?: string }
  ): Promise<{
    success: boolean;
    participant: string;
    team: string;
    leaderboardRemoved: boolean;
    redisVerified: boolean;
    dynamicResourcesCleaned: boolean;
    databaseCommitted: boolean;
    auditRecorded: boolean;
  }> {
    // 1. Look up test account and verify test eligibility
    const lookup = await this.lookupTestTeamByUsername(username);

    // 2. Safety confirmation check (Part 4)
    const expectedConfirmation = `DELETE ${lookup.username}`;
    if (confirmation.trim() !== expectedConfirmation) {
      throw new Error('CANCELLED');
    }

    // 3. Dynamic Challenge Resources Cleanup (Part 10)
    try {
      const instances = await db
        .select({
          id: challengeInstances.id,
          containerId: challengeInstances.containerId,
          status: challengeInstances.status,
        })
        .from(challengeInstances)
        .where(eq(challengeInstances.teamId, lookup.teamId));

      const gateway = getChallengeGatewayClient();
      for (const inst of instances) {
        try {
          await gateway.stopAndRemoveInstance(inst.id);
        } catch (err: any) {
          logger.warn({ instanceId: inst.id, err: err.message }, 'Failed to stop instance via gateway');
        }
        if (inst.containerId) {
          try {
            await gateway.stopAndRemoveContainer(inst.containerId);
          } catch (err: any) {
            logger.warn({ containerId: inst.containerId, err: err.message }, 'Failed to stop container via gateway');
          }
        }
      }
    } catch (instErr: any) {
      logger.warn({ err: instErr.message }, 'Error during dynamic challenge cleanup');
    }

    // 4. Atomic database deletion in a transaction
    await db.transaction(async (tx) => {
      // Find all team members
      const members = await tx
        .select({ userId: teamMembers.userId })
        .from(teamMembers)
        .where(eq(teamMembers.teamId, lookup.teamId));

      const userIdsToDelete = Array.from(new Set([lookup.userId, ...members.map((m) => m.userId)]));

      // Disassociate audit logs pointing to these users
      for (const uId of userIdsToDelete) {
        await tx
          .update(auditLogs)
          .set({ actorId: null })
          .where(eq(auditLogs.actorId, uId));
      }

      // Unlink team captain
      await tx
        .update(teams)
        .set({ captainId: null })
        .where(eq(teams.id, lookup.teamId));

      // Delete the team - cascades to team_members, score_events, score_event_outbox,
      // team_solves, submissions, checkpoint_progress, team_hints, challenge_instances!
      await tx.delete(teams).where(eq(teams.id, lookup.teamId));

      // Delete users associated with this test team
      for (const uId of userIdsToDelete) {
        await tx.delete(users).where(eq(users.id, uId));
      }

      // Record audit event inside the transaction
      const auditActorId =
        actor.id && actor.id !== '00000000-0000-0000-0000-000000000000' ? actor.id : null;

      await auditService.record(
        {
          actorId: auditActorId,
          actorRole: actor.role || 'system',
          actorIp: actor.ip || '127.0.0.1',
          action: 'TEST_TEAM_CLEANED',
          entityType: 'test_team',
          entityId: lookup.teamId,
          previousState: {
            teamId: lookup.teamId,
            teamName: lookup.teamName,
            username: lookup.username,
            score: lookup.score,
            solves: lookup.solves,
          },
          newState: null,
          reason: 'Operator test team cleanup',
          requestId: actor.requestId,
        },
        tx
      );
    });

    // 5. Query authoritative PostgreSQL leaderboard to verify removal
    const snapshot = await leaderboardService.getLeaderboardSnapshot();
    const teamStillInPostgres = snapshot.entries.some(
      (e) => e.teamId === lookup.teamId || e.teamName.toLowerCase() === lookup.teamName.toLowerCase()
    );

    // 6. Broadcast updated leaderboard event over Redis Pub/Sub so active SSE clients immediately update
    let redisVerified = true;
    try {
      const redis = getRedisClient();
      if (redis && (redis.status === 'ready' || redis.status === 'connect')) {
        await redis.publish(
          REDIS_LEADERBOARD_CHANNEL,
          JSON.stringify({
            eventId: `cleanup-${Date.now()}`,
            eventType: 'admin_adjustment',
            teamId: lookup.teamId,
            teamScore: 0,
            points: 0,
            leaderboardVersion: snapshot.leaderboardVersion,
            payload: { reason: 'Test team cleanup', timestamp: new Date().toISOString() },
          })
        );
      }
    } catch (redisErr: any) {
      logger.warn({ err: redisErr.message }, 'Failed to publish cleanup to Redis');
      redisVerified = false;
    }

    return {
      success: true,
      participant: lookup.username,
      team: lookup.teamName,
      leaderboardRemoved: !teamStillInPostgres,
      redisVerified,
      dynamicResourcesCleaned: true,
      databaseCommitted: true,
      auditRecorded: true,
    };
  }

  async addTeamMember(
    teamId: string,
    input: AddTeamMemberAdminInput,
    actor: { id: string; role: string; ip: string; requestId?: string }
  ): Promise<any> {
    return await db.transaction(async (tx) => {
      const [team] = await tx
        .select()
        .from(teams)
        .where(eq(teams.id, teamId))
        .for('update');

      if (!team) {
        throw new Error('TEAM_NOT_FOUND');
      }

      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .for('update');

      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      const [existingMembership] = await tx
        .select({ id: teamMembers.id })
        .from(teamMembers)
        .where(eq(teamMembers.userId, input.userId))
        .limit(1);

      if (existingMembership) {
        throw new Error('ALREADY_IN_TEAM');
      }

      const [memberCount] = await tx
        .select({ count: count() })
        .from(teamMembers)
        .where(eq(teamMembers.teamId, teamId));

      if ((memberCount?.count || 0) >= 4) {
        throw new Error('TEAM_FULL');
      }

      const [newMember] = await tx
        .insert(teamMembers)
        .values({
          teamId,
          userId: input.userId,
          role: input.role,
        })
        .returning();

      if (input.role === 'captain' || !team.captainId) {
        await tx
          .update(teams)
          .set({ captainId: input.userId, updatedAt: sql`NOW()` })
          .where(eq(teams.id, teamId));
      }

      await auditService.record(
        {
          actorId: actor.id,
          actorRole: actor.role,
          actorIp: actor.ip,
          action: 'TEAM_MEMBER_ADDED',
          entityType: 'team_member',
          entityId: newMember.id,
          previousState: null,
          newState: { teamId, userId: input.userId, role: input.role },
          reason: input.reason || 'Admin team member provisioning',
          requestId: actor.requestId,
        },
        tx
      );

      return {
        id: newMember.id,
        teamId: newMember.teamId,
        userId: newMember.userId,
        role: newMember.role,
        joinedAt: newMember.joinedAt,
      };
    });
  }

  async removeTeamMember(
    teamId: string,
    userId: string,
    reason: string,
    actor: { id: string; role: string; ip: string; requestId?: string }
  ): Promise<any> {
    return await db.transaction(async (tx) => {
      const [team] = await tx
        .select()
        .from(teams)
        .where(eq(teams.id, teamId))
        .for('update');

      if (!team) {
        throw new Error('TEAM_NOT_FOUND');
      }

      const [membership] = await tx
        .select()
        .from(teamMembers)
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
        .for('update');

      if (!membership) {
        throw new Error('MEMBER_NOT_FOUND');
      }

      await tx
        .delete(teamMembers)
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));

      if (team.captainId === userId) {
        const [nextMember] = await tx
          .select({ userId: teamMembers.userId })
          .from(teamMembers)
          .where(eq(teamMembers.teamId, teamId))
          .limit(1);

        await tx
          .update(teams)
          .set({ captainId: nextMember ? nextMember.userId : null, updatedAt: sql`NOW()` })
          .where(eq(teams.id, teamId));

        if (nextMember) {
          await tx
            .update(teamMembers)
            .set({ role: 'captain' })
            .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, nextMember.userId)));
        }
      }

      await auditService.record(
        {
          actorId: actor.id,
          actorRole: actor.role,
          actorIp: actor.ip,
          action: 'TEAM_MEMBER_REMOVED',
          entityType: 'team_member',
          entityId: membership.id,
          previousState: { teamId, userId, role: membership.role },
          newState: null,
          reason,
          requestId: actor.requestId,
        },
        tx
      );

      return {
        success: true,
        teamId,
        userId,
      };
    });
  }

  async getTeamMembers(teamId: string): Promise<any[]> {
    const members = await db
      .select({
        id: teamMembers.id,
        userId: users.id,
        username: users.username,
        email: users.email,
        role: teamMembers.role,
        isActive: users.isActive,
        joinedAt: teamMembers.joinedAt,
      })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .where(eq(teamMembers.teamId, teamId))
      .orderBy(teamMembers.joinedAt);

    return members;
  }

  async createParticipantUser(
    input: CreateParticipantAdminInput,
    actor: { id: string; role: string; ip: string; requestId?: string }
  ): Promise<any> {
    return await db.transaction(async (tx) => {
      const [team] = await tx
        .select()
        .from(teams)
        .where(eq(teams.id, input.teamId))
        .for('update');

      if (!team) {
        throw new Error('TEAM_NOT_FOUND');
      }

      const normalizedUsername = input.username.trim();
      const normalizedEmail = input.email.trim().toLowerCase();

      const [collision] = await tx
        .select({ id: users.id, username: users.username, email: users.email })
        .from(users)
        .where(
          or(
            sql`LOWER(${users.username}) = LOWER(${normalizedUsername})`,
            sql`LOWER(${users.email}) = LOWER(${normalizedEmail})`
          )
        )
        .limit(1);

      if (collision) {
        if (collision.username.toLowerCase() === normalizedUsername.toLowerCase()) {
          throw new Error('USERNAME_EXISTS');
        }
        throw new Error('EMAIL_EXISTS');
      }

      const [memberCount] = await tx
        .select({ count: count() })
        .from(teamMembers)
        .where(eq(teamMembers.teamId, input.teamId));

      if ((memberCount?.count || 0) >= 4) {
        throw new Error('TEAM_FULL');
      }

      // Hash password using OWASP Argon2id - never log plaintext password
      const passwordHash = await hashPassword(input.password);

      const [newUser] = await tx
        .insert(users)
        .values({
          username: normalizedUsername,
          email: normalizedEmail,
          passwordHash,
          role: 'participant',
          isActive: true,
        })
        .returning({
          id: users.id,
          username: users.username,
          email: users.email,
          role: users.role,
          isActive: users.isActive,
          createdAt: users.createdAt,
        });

      await tx.insert(teamMembers).values({
        teamId: input.teamId,
        userId: newUser.id,
        role: input.roleInTeam,
      });

      if (input.roleInTeam === 'captain' || !team.captainId) {
        await tx
          .update(teams)
          .set({ captainId: newUser.id, updatedAt: sql`NOW()` })
          .where(eq(teams.id, input.teamId));
      }

      await auditService.record(
        {
          actorId: actor.id,
          actorRole: actor.role,
          actorIp: actor.ip,
          action: 'PARTICIPANT_USER_CREATED',
          entityType: 'user',
          entityId: newUser.id,
          previousState: null,
          newState: {
            username: newUser.username,
            email: newUser.email,
            role: newUser.role,
            teamId: input.teamId,
            teamRole: input.roleInTeam,
          },
          reason: input.reason || 'Admin participant provisioning',
          requestId: actor.requestId,
        },
        tx
      );

      return {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        isActive: newUser.isActive,
        teamId: input.teamId,
        teamRole: input.roleInTeam,
        createdAt: newUser.createdAt,
      };
    });
  }

  async resetUserPassword(
    userId: string,
    newPassword: string,
    reason: string,
    actor: { id: string; role: string; ip: string; requestId?: string }
  ): Promise<any> {
    return await db.transaction(async (tx) => {
      const [user] = await tx
        .select({ id: users.id, username: users.username, email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .for('update');

      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      const passwordHash = await hashPassword(newPassword);

      await tx
        .update(users)
        .set({
          passwordHash,
          updatedAt: sql`NOW()`,
        })
        .where(eq(users.id, userId));

      await auditService.record(
        {
          actorId: actor.id,
          actorRole: actor.role,
          actorIp: actor.ip,
          action: 'USER_PASSWORD_RESET',
          entityType: 'user',
          entityId: userId,
          previousState: { passwordReset: false },
          newState: { passwordReset: true },
          reason,
          requestId: actor.requestId,
        },
        tx
      );

      return {
        id: user.id,
        username: user.username,
        message: 'Password reset successfully',
      };
    });
  }

  async patchUser(
    userId: string,
    input: PatchUserAdminInput,
    actor: { id: string; role: string; ip: string; requestId?: string }
  ): Promise<any> {
    return await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .for('update');

      if (!current) {
        throw new Error('USER_NOT_FOUND');
      }

      const updates: any = { updatedAt: sql`NOW()` };
      if (input.username && input.username.trim() !== current.username) {
        const normalized = input.username.trim();
        const [collision] = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(sql`LOWER(${users.username}) = LOWER(${normalized})`, ne(users.id, userId)))
          .limit(1);

        if (collision) {
          throw new Error('USERNAME_EXISTS');
        }
        updates.username = normalized;
      }

      if (input.email && input.email.trim().toLowerCase() !== current.email) {
        const normalized = input.email.trim().toLowerCase();
        const [collision] = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(sql`LOWER(${users.email}) = LOWER(${normalized})`, ne(users.id, userId)))
          .limit(1);

        if (collision) {
          throw new Error('EMAIL_EXISTS');
        }
        updates.email = normalized;
      }

      if (input.isActive !== undefined) {
        updates.isActive = input.isActive;
      }

      const [updated] = await tx
        .update(users)
        .set(updates)
        .where(eq(users.id, userId))
        .returning({
          id: users.id,
          username: users.username,
          email: users.email,
          role: users.role,
          isActive: users.isActive,
          createdAt: users.createdAt,
        });

      await auditService.record(
        {
          actorId: actor.id,
          actorRole: actor.role,
          actorIp: actor.ip,
          action: 'USER_UPDATED',
          entityType: 'user',
          entityId: userId,
          previousState: {
            username: current.username,
            email: current.email,
            isActive: current.isActive,
          },
          newState: {
            username: updated.username,
            email: updated.email,
            isActive: updated.isActive,
          },
          reason: input.reason,
          requestId: actor.requestId,
        },
        tx
      );

      return updated;
    });
  }

  // ---------------------------------------------------------------------------
  // 5. OPERATIONS CONTROL CENTER TELEMETRY & MANAGEMENT
  // ---------------------------------------------------------------------------

  async getOverviewStats(): Promise<{
    eventStatus: string;
    activeTeams: number;
    activeParticipants: number;
    totalSolves: number;
    totalSubmissions: number;
    hintsUsed: number;
    currentLeaderboardVersion: number;
    sseConnections: number;
    dynamicInstances: number;
    health: {
      server: 'HEALTHY' | 'DEGRADED' | 'DOWN';
      database: 'HEALTHY' | 'DEGRADED' | 'DOWN';
      redis: 'HEALTHY' | 'DEGRADED' | 'DOWN';
      gateway: 'HEALTHY' | 'DEGRADED' | 'DOWN';
    };
    recentSolves: any[];
    recentFailedSubmissions: any[];
    recentTeamChanges: any[];
    recentAdminActions: any[];
    recentSecurityEvents: any[];
  }> {
    // 1. Competition state
    const [comp] = await db
      .select({ state: competitionState.state })
      .from(competitionState)
      .where(eq(competitionState.id, 'default'))
      .limit(1);

    const eventStatus = (comp?.state || 'DRAFT').toUpperCase();

    // 2. Counts
    const [teamsCount] = await db
      .select({ count: count() })
      .from(teams)
      .where(eq(teams.status, 'active'));

    const [participantsCount] = await db
      .select({ count: count() })
      .from(users)
      .where(and(eq(users.role, 'participant'), eq(users.isActive, true)));

    const [solvesCount] = await db.select({ count: count() }).from(teamSolves);
    const [submissionsCount] = await db.select({ count: count() }).from(submissions);
    const [hintsCount] = await db.select({ count: count() }).from(teamHints);

    // Dynamic instances
    const [dynCount] = await db
      .select({ count: count() })
      .from(challengeInstances)
      .where(inArray(challengeInstances.status, ['CREATING', 'RUNNING']));

    // Leaderboard version
    let currentLeaderboardVersion = 0;
    try {
      const res: any = await db.execute(
        sql`SELECT COALESCE(MAX(leaderboard_version), 0)::bigint AS max_version FROM score_event_outbox`
      );
      const row = res?.rows?.[0] || res?.[0];
      currentLeaderboardVersion = Number(row?.max_version || 0);
    } catch {
      const [evCount] = await db.select({ count: count() }).from(scoreEvents);
      currentLeaderboardVersion = Number(evCount?.count || 0);
    }

    // Probes
    let databaseHealth: 'HEALTHY' | 'DEGRADED' | 'DOWN' = 'HEALTHY';
    try {
      await db.execute(sql`SELECT 1`);
    } catch {
      databaseHealth = 'DOWN';
    }

    let redisHealth: 'HEALTHY' | 'DEGRADED' | 'DOWN' = 'HEALTHY';
    let sseConnections = 0;
    try {
      const redis = getRedisClient();
      await redis.ping();
      const sseCount = await redis.get('sse:active_clients_count');
      sseConnections = sseCount ? parseInt(sseCount, 10) : 0;
    } catch {
      redisHealth = 'DOWN';
    }

    let gatewayHealth: 'HEALTHY' | 'DEGRADED' | 'DOWN' = 'HEALTHY';
    try {
      const gwRes = await fetch('http://challenge_gateway:5000/health', {
        signal: AbortSignal.timeout(1500),
      }).catch(() => null);
      if (!gwRes || !gwRes.ok) {
        gatewayHealth = 'DEGRADED';
      }
    } catch {
      gatewayHealth = 'DEGRADED';
    }

    // Recent lists
    const recentSolves = await db
      .select({
        id: teamSolves.id,
        teamId: teamSolves.teamId,
        teamName: teams.name,
        challengeId: teamSolves.challengeId,
        challengeTitle: challenges.title,
        solvedAt: teamSolves.solvedAt,
      })
      .from(teamSolves)
      .innerJoin(teams, eq(teamSolves.teamId, teams.id))
      .innerJoin(challenges, eq(teamSolves.challengeId, challenges.id))
      .orderBy(desc(teamSolves.solvedAt))
      .limit(8);

    const recentFailedSubmissions = await db
      .select({
        id: submissions.id,
        teamName: teams.name,
        username: users.username,
        challengeTitle: challenges.title,
        createdAt: submissions.createdAt,
      })
      .from(submissions)
      .innerJoin(teams, eq(submissions.teamId, teams.id))
      .innerJoin(users, eq(submissions.userId, users.id))
      .innerJoin(challenges, eq(submissions.challengeId, challenges.id))
      .where(eq(submissions.isCorrect, false))
      .orderBy(desc(submissions.createdAt))
      .limit(8);

    const recentTeamChanges = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityId: auditLogs.entityId,
        reason: auditLogs.reason,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(or(eq(auditLogs.entityType, 'team'), sql`${auditLogs.action} ILIKE '%TEAM%'`))
      .orderBy(desc(auditLogs.createdAt))
      .limit(6);

    const recentAdminActions = await db
      .select({
        id: auditLogs.id,
        actorRole: auditLogs.actorRole,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        reason: auditLogs.reason,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(inArray(auditLogs.actorRole, ['admin', 'superadmin']))
      .orderBy(desc(auditLogs.createdAt))
      .limit(6);

    const recentSecurityEvents = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        actorIp: auditLogs.actorIp,
        reason: auditLogs.reason,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(
        or(
          inArray(auditLogs.action, [
            'login_failure',
            'RATE_LIMIT_EXCEEDED',
            'CSRF_FAILED',
            'UNAUTHORIZED_ACCESS',
            'FLAG_INSPECTION',
            'SECURITY_EVENT',
          ]),
          sql`${auditLogs.action} ILIKE '%FAIL%'`,
          sql`${auditLogs.action} ILIKE '%SECURITY%'`
        )
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(6);

    return {
      eventStatus,
      activeTeams: Number(teamsCount?.count || 0),
      activeParticipants: Number(participantsCount?.count || 0),
      totalSolves: Number(solvesCount?.count || 0),
      totalSubmissions: Number(submissionsCount?.count || 0),
      hintsUsed: Number(hintsCount?.count || 0),
      currentLeaderboardVersion,
      sseConnections,
      dynamicInstances: Number(dynCount?.count || 0),
      health: {
        server: 'HEALTHY',
        database: databaseHealth,
        redis: redisHealth,
        gateway: gatewayHealth,
      },
      recentSolves,
      recentFailedSubmissions,
      recentTeamChanges,
      recentAdminActions,
      recentSecurityEvents,
    };
  }

  async listSubmissions(params?: {
    page?: number;
    limit?: number;
    teamId?: string;
    challengeId?: string;
    isCorrect?: boolean;
    search?: string;
  }): Promise<{
    submissions: Array<{
      id: string;
      teamId: string;
      teamName: string;
      userId: string;
      username: string;
      challengeId: string;
      challengeTitle: string;
      isCorrect: boolean;
      ipAddress: string;
      userAgent: string | null;
      createdAt: Date;
    }>;
    total: number;
    page: number;
    limit: number;
  }> {
    const page = Math.max(1, params?.page || 1);
    const limit = Math.min(100, Math.max(1, params?.limit || 50));
    const offset = (page - 1) * limit;

    const conditions: any[] = [];
    if (params?.teamId) {
      conditions.push(eq(submissions.teamId, params.teamId));
    }
    if (params?.challengeId) {
      conditions.push(eq(submissions.challengeId, params.challengeId));
    }
    if (params?.isCorrect !== undefined) {
      conditions.push(eq(submissions.isCorrect, params.isCorrect));
    }
    if (params?.search) {
      const term = `%${params.search}%`;
      conditions.push(
        or(
          sql`${teams.name} ILIKE ${term}`,
          sql`${users.username} ILIKE ${term}`,
          sql`${challenges.title} ILIKE ${term}`
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRes] = await db
      .select({ count: count() })
      .from(submissions)
      .innerJoin(teams, eq(submissions.teamId, teams.id))
      .innerJoin(users, eq(submissions.userId, users.id))
      .innerJoin(challenges, eq(submissions.challengeId, challenges.id))
      .where(whereClause);

    const rows = await db
      .select({
        id: submissions.id,
        teamId: submissions.teamId,
        teamName: teams.name,
        userId: submissions.userId,
        username: users.username,
        challengeId: submissions.challengeId,
        challengeTitle: challenges.title,
        isCorrect: submissions.isCorrect,
        ipAddress: submissions.ipAddress,
        userAgent: submissions.userAgent,
        createdAt: submissions.createdAt,
      })
      .from(submissions)
      .innerJoin(teams, eq(submissions.teamId, teams.id))
      .innerJoin(users, eq(submissions.userId, users.id))
      .innerJoin(challenges, eq(submissions.challengeId, challenges.id))
      .where(whereClause)
      .orderBy(desc(submissions.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      submissions: rows,
      total: Number(totalRes?.count || 0),
      page,
      limit,
    };
  }

  async inspectSubmissionFlag(
    submissionId: string,
    actor: any,
    reason: string
  ): Promise<{ id: string; submittedFlag: string }> {
    const [sub] = await db
      .select({ id: submissions.id, submittedFlag: submissions.submittedFlag })
      .from(submissions)
      .where(eq(submissions.id, submissionId))
      .limit(1);

    if (!sub) throw new Error('SUBMISSION_NOT_FOUND');

    await auditService.record({
      actorId: actor.id,
      actorRole: actor.role,
      actorIp: actor.ip,
      action: 'FLAG_INSPECTION',
      entityType: 'submission',
      entityId: submissionId,
      reason: reason || 'Privileged flag inspection by administrator',
      requestId: actor.requestId,
    });

    return { id: sub.id, submittedFlag: sub.submittedFlag };
  }

  async listAllCheckpoints(): Promise<any[]> {
    const list = await db
      .select({
        id: checkpoints.id,
        challengeId: checkpoints.challengeId,
        challengeTitle: challenges.title,
        challengeSlug: challenges.slug,
        stepNumber: checkpoints.stepNumber,
        title: checkpoints.title,
        description: checkpoints.description,
        pointValue: checkpoints.pointValue,
        validationType: checkpoints.validationType,
        createdAt: checkpoints.createdAt,
      })
      .from(checkpoints)
      .innerJoin(challenges, eq(checkpoints.challengeId, challenges.id))
      .orderBy(challenges.title, checkpoints.stepNumber);

    const counts = await db
      .select({
        checkpointId: checkpointProgress.checkpointId,
        completedCount: count(),
      })
      .from(checkpointProgress)
      .groupBy(checkpointProgress.checkpointId);

    const countMap = new Map(counts.map((c) => [c.checkpointId, Number(c.completedCount)]));

    return list.map((cp) => ({
      ...cp,
      completionCount: countMap.get(cp.id) || 0,
    }));
  }

  async listAllHints(): Promise<any[]> {
    const list = await db
      .select({
        id: hints.id,
        challengeId: hints.challengeId,
        challengeTitle: challenges.title,
        challengeSlug: challenges.slug,
        orderNumber: hints.orderNumber,
        content: hints.content,
        penaltyPoints: hints.penaltyPoints,
        createdAt: hints.createdAt,
      })
      .from(hints)
      .innerJoin(challenges, eq(hints.challengeId, challenges.id))
      .orderBy(challenges.title, hints.orderNumber);

    const unlocks = await db
      .select({
        hintId: teamHints.hintId,
        unlockedCount: count(),
      })
      .from(teamHints)
      .groupBy(teamHints.hintId);

    const unlockMap = new Map(unlocks.map((u) => [u.hintId, Number(u.unlockedCount)]));

    return list.map((h) => ({
      ...h,
      unlockedCount: unlockMap.get(h.id) || 0,
    }));
  }

  async updateHint(
    hintId: string,
    data: { content?: string; penaltyPoints?: number; orderNumber?: number },
    actor: any
  ): Promise<any> {
    const [current] = await db.select().from(hints).where(eq(hints.id, hintId)).limit(1);
    if (!current) throw new Error('HINT_NOT_FOUND');

    const [updated] = await db
      .update(hints)
      .set({
        ...(data.content !== undefined ? { content: data.content } : {}),
        ...(data.penaltyPoints !== undefined ? { penaltyPoints: data.penaltyPoints } : {}),
        ...(data.orderNumber !== undefined ? { orderNumber: data.orderNumber } : {}),
      })
      .where(eq(hints.id, hintId))
      .returning();

    await auditService.record({
      actorId: actor.id,
      actorRole: actor.role,
      actorIp: actor.ip,
      action: 'HINT_UPDATED',
      entityType: 'hint',
      entityId: hintId,
      previousState: current,
      newState: updated,
      reason: 'Admin updated hint configuration',
      requestId: actor.requestId,
    });
    return updated;
  }

  async deleteHint(hintId: string, actor: any): Promise<{ deleted: boolean }> {
    const [current] = await db.select().from(hints).where(eq(hints.id, hintId)).limit(1);
    if (!current) throw new Error('HINT_NOT_FOUND');

    await db.delete(hints).where(eq(hints.id, hintId));

    await auditService.record({
      actorId: actor.id,
      actorRole: actor.role,
      actorIp: actor.ip,
      action: 'HINT_DELETED',
      entityType: 'hint',
      entityId: hintId,
      previousState: current,
      reason: 'Admin deleted challenge hint',
      requestId: actor.requestId,
    });
    return { deleted: true };
  }

  async listDynamicInstances(): Promise<any[]> {
    return await db
      .select({
        id: challengeInstances.id,
        challengeId: challengeInstances.challengeId,
        challengeTitle: challenges.title,
        teamId: challengeInstances.teamId,
        teamName: teams.name,
        status: challengeInstances.status,
        containerId: challengeInstances.containerId,
        containerName: challengeInstances.containerName,
        internalIp: challengeInstances.internalIp,
        internalPort: challengeInstances.internalPort,
        createdAt: challengeInstances.createdAt,
        expiresAt: challengeInstances.expiresAt,
        failureReason: challengeInstances.failureReason,
      })
      .from(challengeInstances)
      .innerJoin(challenges, eq(challengeInstances.challengeId, challenges.id))
      .innerJoin(teams, eq(challengeInstances.teamId, teams.id))
      .orderBy(desc(challengeInstances.createdAt));
  }

  async cleanupExpiredInstances(actor: any): Promise<{ cleanedCount: number }> {
    const now = new Date();
    const expired = await db
      .select({ id: challengeInstances.id, containerName: challengeInstances.containerName })
      .from(challengeInstances)
      .where(
        and(
          sql`${challengeInstances.expiresAt} < ${now}`,
          inArray(challengeInstances.status, ['CREATING', 'RUNNING'])
        )
      );

    if (expired.length > 0) {
      await db
        .update(challengeInstances)
        .set({ status: 'EXPIRED', stoppedAt: now })
        .where(inArray(challengeInstances.id, expired.map((e) => e.id)));

      await auditService.record({
        actorId: actor.id,
        actorRole: actor.role,
        actorIp: actor.ip,
        action: 'DYNAMIC_INSTANCES_CLEANED',
        entityType: 'challenge_instance',
        reason: `Cleaned up ${expired.length} expired dynamic challenge instances`,
        requestId: actor.requestId,
        detailsJson: { count: expired.length, instanceIds: expired.map((e) => e.id) },
      });
    }

    return { cleanedCount: expired.length };
  }

  async getScoreLedger(params?: { page?: number; limit?: number; teamId?: string }): Promise<{
    entries: any[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = Math.max(1, params?.page || 1);
    const limit = Math.min(100, Math.max(1, params?.limit || 50));
    const offset = (page - 1) * limit;

    const conditions: any[] = [];
    if (params?.teamId) {
      conditions.push(eq(scoreEvents.teamId, params.teamId));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRes] = await db
      .select({ count: count() })
      .from(scoreEvents)
      .where(whereClause);

    const rows = await db
      .select({
        id: scoreEvents.id,
        teamId: scoreEvents.teamId,
        teamName: teams.name,
        challengeId: scoreEvents.challengeId,
        challengeTitle: challenges.title,
        eventType: scoreEvents.eventType,
        points: scoreEvents.points,
        runningTeamScore: scoreEvents.runningTeamScore,
        createdAt: scoreEvents.createdAt,
      })
      .from(scoreEvents)
      .innerJoin(teams, eq(scoreEvents.teamId, teams.id))
      .leftJoin(challenges, eq(scoreEvents.challengeId, challenges.id))
      .where(whereClause)
      .orderBy(desc(scoreEvents.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      entries: rows,
      total: Number(totalRes?.count || 0),
      page,
      limit,
    };
  }

  async listAnnouncements(): Promise<any[]> {
    return await db
      .select({
        id: announcements.id,
        title: announcements.title,
        content: announcements.content,
        isPinned: announcements.isPinned,
        createdAt: announcements.createdAt,
        updatedAt: announcements.updatedAt,
        authorUsername: users.username,
      })
      .from(announcements)
      .innerJoin(users, eq(announcements.authorId, users.id))
      .orderBy(desc(announcements.isPinned), desc(announcements.createdAt));
  }

  async createAnnouncement(
    data: { title: string; content: string; isPinned?: boolean },
    actor: any
  ): Promise<any> {
    const [created] = await db
      .insert(announcements)
      .values({
        title: data.title.trim(),
        content: data.content.trim(),
        authorId: actor.id,
        isPinned: !!data.isPinned,
      })
      .returning();

    await auditService.record({
      actorId: actor.id,
      actorRole: actor.role,
      actorIp: actor.ip,
      action: 'ANNOUNCEMENT_CREATED',
      entityType: 'announcement',
      entityId: created.id,
      newState: created,
      reason: 'Admin posted tournament announcement',
      requestId: actor.requestId,
    });

    return created;
  }

  async deleteAnnouncement(id: string, actor: any): Promise<{ deleted: boolean }> {
    const [existing] = await db.select().from(announcements).where(eq(announcements.id, id)).limit(1);
    if (!existing) throw new Error('ANNOUNCEMENT_NOT_FOUND');

    await db.delete(announcements).where(eq(announcements.id, id));

    await auditService.record({
      actorId: actor.id,
      actorRole: actor.role,
      actorIp: actor.ip,
      action: 'ANNOUNCEMENT_DELETED',
      entityType: 'announcement',
      entityId: id,
      previousState: existing,
      reason: 'Admin removed announcement',
      requestId: actor.requestId,
    });

    return { deleted: true };
  }

  async listBackups(): Promise<any[]> {
    const backupDir = path.resolve(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      return [];
    }
    const files = fs.readdirSync(backupDir);
    const backupFiles = files
      .filter((f) => f.endsWith('.sql.gz') || f.endsWith('.sql'))
      .map((f) => {
        const fullPath = path.join(backupDir, f);
        const stats = fs.statSync(fullPath);
        return {
          filename: f,
          sizeBytes: stats.size,
          createdAt: stats.birthtime || stats.mtime,
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return backupFiles;
  }

  async createBackup(actor: any): Promise<{ filename: string; sizeBytes: number }> {
    const backupDir = path.resolve(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '_')
      .split('.')[0];
    const filename = `techx_ctf_backup_${timestamp}.sql.gz`;
    const fullPath = path.join(backupDir, filename);

    try {
      await execAsync(
        `docker exec techx_ctf_postgres pg_dump -U techx_ctf_user -d techx_ctf_db --clean --if-exists | gzip > "${fullPath}"`,
        { shell: 'bash' }
      );
    } catch {
      const sqlFile = path.join(backupDir, `techx_ctf_backup_${timestamp}.sql`);
      await execAsync(
        `docker exec techx_ctf_postgres pg_dump -U techx_ctf_user -d techx_ctf_db --clean --if-exists > "${sqlFile}"`
      );
      const stats = fs.statSync(sqlFile);
      await auditService.record({
        actorId: actor.id,
        actorRole: actor.role,
        actorIp: actor.ip,
        action: 'DATABASE_BACKUP_CREATED',
        entityType: 'backup',
        entityId: `techx_ctf_backup_${timestamp}.sql`,
        reason: 'Administrator triggered manual database backup',
        requestId: actor.requestId,
      });
      return { filename: `techx_ctf_backup_${timestamp}.sql`, sizeBytes: stats.size };
    }

    const stats = fs.statSync(fullPath);
    await auditService.record({
      actorId: actor.id,
      actorRole: actor.role,
      actorIp: actor.ip,
      action: 'DATABASE_BACKUP_CREATED',
      entityType: 'backup',
      entityId: filename,
      reason: 'Administrator triggered manual database backup',
      requestId: actor.requestId,
    });

    return { filename, sizeBytes: stats.size };
  }

  async restoreBackup(
    filename: string,
    confirmationPhrase: string,
    actor: any
  ): Promise<{ success: boolean; message: string }> {
    if (confirmationPhrase !== 'RESTORE') {
      throw new Error('INVALID_CONFIRMATION_PHRASE');
    }
    const sanitized = path.basename(filename);
    if (!sanitized || sanitized.includes('..') || (!sanitized.endsWith('.sql') && !sanitized.endsWith('.sql.gz'))) {
      throw new Error('INVALID_BACKUP_FILENAME');
    }
    const backupDir = path.resolve(process.cwd(), 'backups');
    const fullPath = path.join(backupDir, sanitized);
    if (!fs.existsSync(fullPath)) {
      throw new Error('BACKUP_FILE_NOT_FOUND');
    }

    try {
      if (sanitized.endsWith('.gz')) {
        await execAsync(
          `gunzip -c "${fullPath}" | docker exec -i techx_ctf_postgres psql -U techx_ctf_user -d techx_ctf_db`,
          { shell: 'bash' }
        );
      } else {
        await execAsync(
          `docker exec -i techx_ctf_postgres psql -U techx_ctf_user -d techx_ctf_db < "${fullPath}"`
        );
      }
    } catch (err: any) {
      throw new Error(`Restore failed: ${err.message}`);
    }

    await auditService.record({
      actorId: actor.id,
      actorRole: actor.role,
      actorIp: actor.ip,
      action: 'DATABASE_RESTORED',
      entityType: 'backup',
      entityId: sanitized,
      reason: 'Administrator performed database restoration',
      requestId: actor.requestId,
    });

    return { success: true, message: `Database restored from ${sanitized}` };
  }

  async getSecurityEvents(params?: { page?: number; limit?: number; search?: string }): Promise<any> {
    const page = Math.max(1, params?.page || 1);
    const limit = Math.min(100, Math.max(1, params?.limit || 50));
    const offset = (page - 1) * limit;

    const securityActions = [
      'login_failure',
      'RATE_LIMIT_EXCEEDED',
      'CSRF_FAILED',
      'UNAUTHORIZED_ACCESS',
      'FLAG_INSPECTION',
      'SECURITY_EVENT',
      'BLOCKED_ATTEMPT',
      'SUSPICIOUS_SUBMISSION',
    ];

    const conditions: any[] = [
      or(
        inArray(auditLogs.action, securityActions),
        sql`${auditLogs.action} ILIKE '%FAIL%'`,
        sql`${auditLogs.action} ILIKE '%SECURITY%'`,
        sql`${auditLogs.action} ILIKE '%UNAUTHORIZED%'`
      ),
    ];

    if (params?.search) {
      const term = `%${params.search}%`;
      conditions.push(
        or(
          sql`${auditLogs.action} ILIKE ${term}`,
          sql`${auditLogs.actorIp} ILIKE ${term}`,
          sql`${auditLogs.reason} ILIKE ${term}`
        )
      );
    }

    const whereClause = and(...conditions);

    const [totalRes] = await db
      .select({ count: count() })
      .from(auditLogs)
      .where(whereClause);

    const rows = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        actorId: auditLogs.actorId,
        actorRole: auditLogs.actorRole,
        actorIp: auditLogs.actorIp,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        reason: auditLogs.reason,
        detailsJson: auditLogs.detailsJson,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(whereClause)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      events: rows,
      total: Number(totalRes?.count || 0),
      page,
      limit,
    };
  }

  async getDetailedSystemHealth(): Promise<any> {
    let dbStatus: 'HEALTHY' | 'DEGRADED' | 'DOWN' = 'HEALTHY';
    let dbLatencyMs = 0;
    try {
      const dbStart = Date.now();
      await db.execute(sql`SELECT 1`);
      dbLatencyMs = Date.now() - dbStart;
    } catch {
      dbStatus = 'DOWN';
    }

    let redisStatus: 'HEALTHY' | 'DEGRADED' | 'DOWN' = 'HEALTHY';
    let redisLatencyMs = 0;
    try {
      const redisStart = Date.now();
      const redis = getRedisClient();
      await redis.ping();
      redisLatencyMs = Date.now() - redisStart;
    } catch {
      redisStatus = 'DOWN';
    }

    let gatewayStatus: 'HEALTHY' | 'DEGRADED' | 'DOWN' = 'HEALTHY';
    try {
      const gwRes = await fetch('http://challenge_gateway:5000/health', {
        signal: AbortSignal.timeout(1500),
      }).catch(() => null);
      if (!gwRes || !gwRes.ok) {
        gatewayStatus = 'DEGRADED';
      }
    } catch {
      gatewayStatus = 'DEGRADED';
    }

    const [pendingOutbox] = await db
      .select({ count: count() })
      .from(scoreEventOutbox)
      .where(sql`${scoreEventOutbox.publishedAt} IS NULL`);

    const [activeInstancesCount] = await db
      .select({ count: count() })
      .from(challengeInstances)
      .where(inArray(challengeInstances.status, ['CREATING', 'RUNNING']));

    return {
      overall: dbStatus === 'HEALTHY' && redisStatus === 'HEALTHY' ? 'HEALTHY' : 'DEGRADED',
      components: {
        server: {
          status: 'HEALTHY',
          uptimeSeconds: Math.floor(process.uptime()),
          memory: process.memoryUsage(),
          nodeVersion: process.version,
        },
        database: {
          status: dbStatus,
          latencyMs: dbLatencyMs,
        },
        redis: {
          status: redisStatus,
          latencyMs: redisLatencyMs,
        },
        gateway: {
          status: gatewayStatus,
        },
        outbox: {
          pendingCount: Number(pendingOutbox?.count || 0),
          status: Number(pendingOutbox?.count || 0) < 50 ? 'HEALTHY' : 'DEGRADED',
        },
        dynamicRuntime: {
          activeInstances: Number(activeInstancesCount?.count || 0),
        },
      },
      timestamp: new Date().toISOString(),
    };
  }

  async emergencyAction(
    action: 'pause' | 'resume' | 'disable_submissions' | 'enable_submissions' | 'maintenance',
    reason: string,
    actor: any
  ): Promise<{ success: boolean; state: any }> {
    const [state] = await db
      .select()
      .from(competitionState)
      .where(eq(competitionState.id, 'default'))
      .limit(1);

    const updates: Partial<typeof competitionState.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (action === 'pause') {
      updates.state = 'paused';
    } else if (action === 'resume') {
      updates.state = 'live';
      updates.isSubmissionEnabled = true;
    } else if (action === 'disable_submissions') {
      updates.isSubmissionEnabled = false;
    } else if (action === 'enable_submissions') {
      updates.isSubmissionEnabled = true;
    } else if (action === 'maintenance') {
      updates.state = 'paused';
      updates.isSubmissionEnabled = false;
    }

    const [updated] = await db
      .update(competitionState)
      .set(updates)
      .where(eq(competitionState.id, 'default'))
      .returning();

    await auditService.record({
      actorId: actor.id,
      actorRole: actor.role,
      actorIp: actor.ip,
      action: `EMERGENCY_${action.toUpperCase()}`,
      entityType: 'competition_state',
      entityId: 'default',
      previousState: state,
      newState: updated,
      reason: reason || `Emergency action: ${action}`,
      requestId: actor.requestId,
    });

    try {
      const redis = getRedisClient();
      await redis.publish(
        REDIS_LEADERBOARD_CHANNEL,
        JSON.stringify({
          type: 'COMPETITION_STATE_CHANGE',
          state: updated.state,
          isSubmissionEnabled: updated.isSubmissionEnabled,
          timestamp: new Date().toISOString(),
        })
      );
    } catch {}

    return { success: true, state: updated };
  }

  async exportData(
    type: 'teams' | 'participants' | 'leaderboard' | 'submissions' | 'audit'
  ): Promise<string> {
    const toCsv = (rows: (string | number | boolean | null | undefined)[][]): string => {
      return rows
        .map((row) =>
          row
            .map((val) => {
              if (val === null || val === undefined) return '""';
              return `"${String(val).replace(/"/g, '""')}"`;
            })
            .join(',')
        )
        .join('\n');
    };

    if (type === 'teams') {
      const allTeams = await db
        .select({
          id: teams.id,
          name: teams.name,
          score: teams.score,
          status: teams.status,
          isBanned: teams.isBanned,
          createdAt: teams.createdAt,
        })
        .from(teams)
        .orderBy(desc(teams.score));

      const rows = [
        ['ID', 'Team Name', 'Score', 'Status', 'Is Banned', 'Created At'],
        ...allTeams.map((t) => [
          t.id,
          t.name,
          t.score,
          t.status,
          t.isBanned,
          t.createdAt.toISOString(),
        ]),
      ];
      return toCsv(rows);
    }

    if (type === 'participants') {
      const allUsers = await db
        .select({
          id: users.id,
          username: users.username,
          email: users.email,
          role: users.role,
          isActive: users.isActive,
          createdAt: users.createdAt,
          teamName: teams.name,
        })
        .from(users)
        .leftJoin(teamMembers, eq(users.id, teamMembers.userId))
        .leftJoin(teams, eq(teamMembers.teamId, teams.id))
        .orderBy(users.createdAt);

      const rows = [
        ['ID', 'Username', 'Email', 'Role', 'Is Active', 'Team', 'Created At'],
        ...allUsers.map((u) => [
          u.id,
          u.username,
          u.email,
          u.role,
          u.isActive,
          u.teamName || 'None',
          u.createdAt.toISOString(),
        ]),
      ];
      return toCsv(rows);
    }

    if (type === 'leaderboard') {
      const snapshot = await leaderboardService.getLeaderboardSnapshot();
      const rows = [
        ['Rank', 'Team Name', 'Score', 'Last Solve At'],
        ...snapshot.entries.map((e) => [e.rank, e.teamName, e.score, e.lastScoreAt]),
      ];
      return toCsv(rows);
    }

    if (type === 'submissions') {
      const subs = await db
        .select({
          id: submissions.id,
          teamName: teams.name,
          username: users.username,
          challengeTitle: challenges.title,
          isCorrect: submissions.isCorrect,
          ipAddress: submissions.ipAddress,
          createdAt: submissions.createdAt,
        })
        .from(submissions)
        .innerJoin(teams, eq(submissions.teamId, teams.id))
        .innerJoin(users, eq(submissions.userId, users.id))
        .innerJoin(challenges, eq(submissions.challengeId, challenges.id))
        .orderBy(desc(submissions.createdAt))
        .limit(1000);

      // Explicitly sanitized: NO submittedFlag
      const rows = [
        ['ID', 'Team Name', 'Username', 'Challenge', 'Result', 'IP Address', 'Timestamp'],
        ...subs.map((s) => [
          s.id,
          s.teamName,
          s.username,
          s.challengeTitle,
          s.isCorrect ? 'CORRECT' : 'INCORRECT',
          s.ipAddress,
          s.createdAt.toISOString(),
        ]),
      ];
      return toCsv(rows);
    }

    if (type === 'audit') {
      const logs = await db
        .select({
          id: auditLogs.id,
          actorRole: auditLogs.actorRole,
          actorIp: auditLogs.actorIp,
          action: auditLogs.action,
          entityType: auditLogs.entityType,
          entityId: auditLogs.entityId,
          reason: auditLogs.reason,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .orderBy(desc(auditLogs.createdAt))
        .limit(1000);

      const rows = [
        ['ID', 'Timestamp', 'Actor Role', 'Actor IP', 'Action', 'Entity Type', 'Entity ID', 'Reason'],
        ...logs.map((l) => [
          l.id,
          l.createdAt.toISOString(),
          l.actorRole,
          l.actorIp,
          l.action,
          l.entityType,
          l.entityId || '',
          l.reason || '',
        ]),
      ];
      return toCsv(rows);
    }

    throw new Error('INVALID_EXPORT_TYPE');
  }
}

export const adminService = new AdminService();
