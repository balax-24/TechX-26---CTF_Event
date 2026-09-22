import { eq, and, ne, sql, desc, count } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  challenges,
  checkpoints,
  checkpointProgress,
  hints,
  categories,
  teams,
  teamMembers,
  users,
  scoreEvents,
  teamSolves,
} from '../../db/schema.js';
import { hashFlag } from '../../utils/flags.js';
import { auditService } from './audit.service.js';
import {
  CreateChallengeAdminInput,
  UpdateChallengeAdminInput,
  CreateCheckpointAdminInput,
  UpdateCheckpointAdminInput,
  CreateHintAdminInput,
  PaginationQuery,
} from './admin.schema.js';

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
}

export const adminService = new AdminService();
