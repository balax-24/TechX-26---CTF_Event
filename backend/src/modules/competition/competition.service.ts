import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { competitionState } from '../../db/schema.js';
import {
  CompetitionLifecycleState,
  ALLOWED_TRANSITIONS,
  UpdateCompetitionConfigInput,
} from './competition.schema.js';
import { auditService } from '../admin/audit.service.js';
import { config } from '../../config/env.js';

export interface CompetitionStateRecord {
  id: string;
  name: string;
  state: CompetitionLifecycleState;
  startTime: Date | null;
  endTime: Date | null;
  registrationStartTime: Date | null;
  registrationEndTime: Date | null;
  timezone: string;
  isSubmissionEnabled: boolean;
  defaultChallengeVisibility: string;
  updatedAt: Date;
}

export class CompetitionService {
  /**
   * Retrieves the current authoritative competition state.
   * Falls back to environment configuration if table is uninitialized.
   */
  async getCompetitionState(): Promise<CompetitionStateRecord> {
    try {
      const [record] = await db
        .select()
        .from(competitionState)
        .where(eq(competitionState.id, 'default'))
        .limit(1);

      if (record) {
        return record as CompetitionStateRecord;
      }
    } catch {
      // Mock / unit test fallback
    }

    // Default fallback mapped from env configuration
    const envState = (config.COMPETITION_STATE || 'active').toLowerCase();
    const mappedState: CompetitionLifecycleState =
      envState === 'active' ? 'live' : envState === 'paused' ? 'paused' : 'draft';

    return {
      id: 'default',
      name: 'TechX CTF 2026',
      state: mappedState,
      startTime: null,
      endTime: null,
      registrationStartTime: null,
      registrationEndTime: null,
      timezone: 'Asia/Kolkata',
      isSubmissionEnabled: mappedState === 'live',
      defaultChallengeVisibility: 'hidden',
      updatedAt: new Date(),
    };
  }

  /**
   * Validates whether participant scoring operations are currently permitted.
   */
  async isScoringAllowed(): Promise<boolean> {
    const current = await this.getCompetitionState();
    const now = new Date();
    const hasStarted = !current.startTime || now >= current.startTime;
    return current.state === 'live' && current.isSubmissionEnabled && hasStarted;
  }

  /**
   * Throws explicit domain errors if competition state prohibits participant scoring.
   */
  async requireLiveCompetition(): Promise<void> {
    const current = await this.getCompetitionState();

    if (current.state === 'paused') {
      throw new Error('COMPETITION_PAUSED');
    }
    if (current.state === 'ended') {
      throw new Error('COMPETITION_ENDED');
    }
    if (current.state === 'archived') {
      throw new Error('COMPETITION_ARCHIVED');
    }
    if (current.state !== 'live') {
      throw new Error('COMPETITION_NOT_ACTIVE');
    }
    if (!current.isSubmissionEnabled) {
      throw new Error('SUBMISSIONS_DISABLED');
    }

    const now = new Date();
    if (current.startTime && now < current.startTime) {
      throw new Error('COMPETITION_NOT_STARTED');
    }
  }

  /**
   * Executes an explicit, validated, transactional state transition.
   */
  async transitionState(params: {
    targetState: CompetitionLifecycleState;
    reason: string;
    actorUserId: string;
    actorRole: string;
    actorIp: string;
    requestId?: string;
  }): Promise<CompetitionStateRecord> {
    const { targetState, reason, actorUserId, actorRole, actorIp, requestId } = params;

    return await db.transaction(async (tx) => {
      // 1. Lock competition state row for exclusive atomic transition
      const [current] = await tx
        .select()
        .from(competitionState)
        .where(eq(competitionState.id, 'default'))
        .for('update');

      const currentState: CompetitionLifecycleState = (current?.state as CompetitionLifecycleState) || 'draft';

      // 2. Validate state transition
      if (currentState === targetState) {
        return current as CompetitionStateRecord;
      }

      const allowedNext = ALLOWED_TRANSITIONS[currentState] || [];
      if (!allowedNext.includes(targetState)) {
        throw new Error(
          `INVALID_STATE_TRANSITION: Cannot transition competition from '${currentState.toUpperCase()}' to '${targetState.toUpperCase()}'`
        );
      }

      // 3. Apply state mutation
      const updateData: any = {
        state: targetState,
        updatedAt: sql`NOW()`,
      };

      if (targetState === 'paused') {
        updateData.isSubmissionEnabled = false;
      } else if (targetState === 'live') {
        updateData.isSubmissionEnabled = true;
      }

      const [updated] = await tx
        .update(competitionState)
        .set(updateData)
        .where(eq(competitionState.id, 'default'))
        .returning();

      // 4. Record audit log
      await auditService.record(
        {
          actorId: actorUserId,
          actorRole,
          actorIp,
          action: 'COMPETITION_STATE_TRANSITION',
          entityType: 'competition',
          entityId: 'default',
          previousState: { state: currentState },
          newState: { state: targetState },
          reason,
          requestId,
        },
        tx
      );

      return updated as CompetitionStateRecord;
    });
  }

  /**
   * Emergency competition pause.
   */
  async emergencyPause(params: {
    reason: string;
    actorUserId: string;
    actorRole: string;
    actorIp: string;
    requestId?: string;
  }): Promise<CompetitionStateRecord> {
    return this.transitionState({
      ...params,
      targetState: 'paused',
    });
  }

  /**
   * Resume competition back to live state.
   */
  async resumeCompetition(params: {
    reason: string;
    actorUserId: string;
    actorRole: string;
    actorIp: string;
    requestId?: string;
  }): Promise<CompetitionStateRecord> {
    return this.transitionState({
      ...params,
      targetState: 'live',
    });
  }

  /**
   * Updates controlled competition configuration settings.
   */
  async updateConfig(params: {
    input: UpdateCompetitionConfigInput;
    actorUserId: string;
    actorRole: string;
    actorIp: string;
    requestId?: string;
  }): Promise<CompetitionStateRecord> {
    const { input, actorUserId, actorRole, actorIp, requestId } = params;

    return await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(competitionState)
        .where(eq(competitionState.id, 'default'))
        .for('update');

      const updateData: any = {
        updatedAt: sql`NOW()`,
      };

      if (input.name !== undefined) updateData.name = input.name;
      if (input.startTime !== undefined)
        updateData.startTime = input.startTime ? new Date(input.startTime) : null;
      if (input.endTime !== undefined)
        updateData.endTime = input.endTime ? new Date(input.endTime) : null;
      if (input.registrationStartTime !== undefined)
        updateData.registrationStartTime = input.registrationStartTime
          ? new Date(input.registrationStartTime)
          : null;
      if (input.registrationEndTime !== undefined)
        updateData.registrationEndTime = input.registrationEndTime
          ? new Date(input.registrationEndTime)
          : null;
      if (input.timezone !== undefined) updateData.timezone = input.timezone;
      if (input.isSubmissionEnabled !== undefined)
        updateData.isSubmissionEnabled = input.isSubmissionEnabled;
      if (input.defaultChallengeVisibility !== undefined)
        updateData.defaultChallengeVisibility = input.defaultChallengeVisibility;

      const [updated] = await tx
        .update(competitionState)
        .set(updateData)
        .where(eq(competitionState.id, 'default'))
        .returning();

      await auditService.record(
        {
          actorId: actorUserId,
          actorRole,
          actorIp,
          action: 'COMPETITION_CONFIG_UPDATE',
          entityType: 'competition',
          entityId: 'default',
          previousState: current,
          newState: updated,
          reason: input.reason || 'Competition configuration updated',
          requestId,
        },
        tx
      );

      return updated as CompetitionStateRecord;
    });
  }
}

export const competitionService = new CompetitionService();
