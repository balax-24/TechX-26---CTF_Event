import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { checkpoints, challenges } from '../../db/schema.js';
import { timingSafeMatch } from '../../utils/crypto.js';
import { hashFlag } from '../../utils/flags.js';
import { scoringService, CheckpointAwardResult } from '../scoring/scoring.service.js';
import { config } from '../../config/env.js';

export interface CheckpointValidationResponse {
  status: 'correct' | 'incorrect' | 'already_completed' | 'already_solved';
  pointsAwarded?: number;
  newTeamScore?: number;
}

export class CheckpointsService {
  /**
   * Validates submitted proof against checkpoint rules and triggers atomic scoring.
   */
  async validateCheckpoint(params: {
    userId: string;
    teamId: string;
    checkpointId: string;
    proof: string;
    isAdmin?: boolean;
  }): Promise<CheckpointValidationResponse> {
    const { userId, teamId, checkpointId, proof, isAdmin = false } = params;

    // 1. Verify Competition State
    if (config.COMPETITION_STATE !== 'active' && !isAdmin) {
      throw new Error('COMPETITION_NOT_ACTIVE');
    }

    // 2. Fetch checkpoint and parent challenge
    const [cp] = await db
      .select({
        id: checkpoints.id,
        challengeId: checkpoints.challengeId,
        validationType: checkpoints.validationType,
        secretProofHash: checkpoints.secretProofHash,
        challengeStatus: challenges.status,
        challengeReleaseTime: challenges.releaseTime,
      })
      .from(checkpoints)
      .innerJoin(challenges, eq(checkpoints.challengeId, challenges.id))
      .where(eq(checkpoints.id, checkpointId))
      .limit(1);

    if (!cp) {
      throw new Error('CHECKPOINT_NOT_FOUND');
    }

    if (!isAdmin) {
      if (cp.challengeStatus !== 'published') {
        throw new Error('CHALLENGE_NOT_RELEASED');
      }
      if (cp.challengeReleaseTime && new Date(cp.challengeReleaseTime) > new Date()) {
        throw new Error('CHALLENGE_NOT_RELEASED');
      }
    }

    // 3. Verify submitted proof based on validationType
    const normalizedProof = proof.trim();
    let isProofValid = false;

    if (cp.validationType === 'token_proof') {
      // Direct constant-time comparison or salted hash comparison
      isProofValid =
        timingSafeMatch(hashFlag(normalizedProof), cp.secretProofHash) ||
        timingSafeMatch(normalizedProof, cp.secretProofHash);
    } else if (cp.validationType === 'sub_flag') {
      isProofValid = timingSafeMatch(hashFlag(normalizedProof), cp.secretProofHash);
    } else if (cp.validationType === 'server_callback') {
      // server_callback is reserved/scaffolded for automated challenge container callbacks.
      // Participants cannot directly validate server-callback checkpoints via the participant API.
      throw new Error('SERVER_CALLBACK_ONLY');
    } else {
      // Default: constant-time match
      isProofValid = timingSafeMatch(normalizedProof, cp.secretProofHash);
    }

    if (!isProofValid) {
      return { status: 'incorrect' };
    }

    // 4. Delegate to atomic scoring engine
    const awardResult: CheckpointAwardResult = await scoringService.awardCheckpoint({
      teamId,
      userId,
      checkpointId,
      proofMetadata: {
        proofSubmittedAt: new Date(),
        validationType: cp.validationType,
      },
    });

    return awardResult;
  }
}

export const checkpointsService = new CheckpointsService();
