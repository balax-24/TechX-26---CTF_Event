import { describe, it, expect } from 'vitest';
import {
  validateCheckpointParamsSchema,
  validateCheckpointBodySchema,
} from '../../src/modules/checkpoints/checkpoints.schema.js';
import { timingSafeMatch } from '../../src/utils/crypto.js';
import { hashFlag } from '../../src/utils/flags.js';

describe('Checkpoint Verification & Prerequisite Validation', () => {
  // ---------------------------------------------------------------------------
  // 1. SCHEMA VALIDATION
  // ---------------------------------------------------------------------------
  describe('Checkpoint Input Schemas', () => {
    it('validates correct checkpoint UUID parameter', () => {
      const validUuid = '123e4567-e89b-12d3-a456-426614174000';
      const result = validateCheckpointParamsSchema.safeParse({ checkpointId: validUuid });
      expect(result.success).toBe(true);
    });

    it('rejects invalid checkpoint UUID parameter', () => {
      const result = validateCheckpointParamsSchema.safeParse({ checkpointId: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });

    it('validates valid proof string in body', () => {
      const result = validateCheckpointBodySchema.safeParse({
        proof: 'checkpoint_token_secret_abc123',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty proof string in body', () => {
      const result = validateCheckpointBodySchema.safeParse({ proof: '' });
      expect(result.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. PREREQUISITE ENFORCEMENT LOGIC
  // ---------------------------------------------------------------------------
  describe('Prerequisite Chain Logic', () => {
    interface CheckpointEntry {
      id: string;
      stepNumber: number;
    }

    function checkPrerequisites(
      targetCheckpoint: CheckpointEntry,
      completedCheckpointIds: Set<string>,
      allCheckpoints: CheckpointEntry[]
    ): { canProceed: boolean; error?: string } {
      if (targetCheckpoint.stepNumber === 1) {
        return { canProceed: true };
      }

      const prevCheckpoint = allCheckpoints.find(
        (cp) => cp.stepNumber === targetCheckpoint.stepNumber - 1
      );

      if (prevCheckpoint && !completedCheckpointIds.has(prevCheckpoint.id)) {
        return { canProceed: false, error: 'PREREQUISITE_NOT_MET' };
      }

      return { canProceed: true };
    }

    const checkpointsList: CheckpointEntry[] = [
      { id: 'cp-step-1', stepNumber: 1 },
      { id: 'cp-step-2', stepNumber: 2 },
      { id: 'cp-step-3', stepNumber: 3 },
    ];

    it('allows completing Step 1 with no prior progress', () => {
      const completed = new Set<string>();
      const res = checkPrerequisites(checkpointsList[0], completed, checkpointsList);
      expect(res.canProceed).toBe(true);
    });

    it('blocks Step 2 when Step 1 is not completed', () => {
      const completed = new Set<string>();
      const res = checkPrerequisites(checkpointsList[1], completed, checkpointsList);
      expect(res.canProceed).toBe(false);
      expect(res.error).toBe('PREREQUISITE_NOT_MET');
    });

    it('allows Step 2 when Step 1 has been completed', () => {
      const completed = new Set<string>(['cp-step-1']);
      const res = checkPrerequisites(checkpointsList[1], completed, checkpointsList);
      expect(res.canProceed).toBe(true);
    });

    it('blocks jumping directly to Step 3 even if Step 1 is done but Step 2 is missing', () => {
      const completed = new Set<string>(['cp-step-1']);
      const res = checkPrerequisites(checkpointsList[2], completed, checkpointsList);
      expect(res.canProceed).toBe(false);
      expect(res.error).toBe('PREREQUISITE_NOT_MET');
    });

    it('allows Step 3 when both Step 1 and Step 2 are completed', () => {
      const completed = new Set<string>(['cp-step-1', 'cp-step-2']);
      const res = checkPrerequisites(checkpointsList[2], completed, checkpointsList);
      expect(res.canProceed).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. PROOF CRYPTOGRAPHIC VALIDATION
  // ---------------------------------------------------------------------------
  describe('Proof Cryptographic Validation', () => {
    it('validates sub_flag proof using hashed comparison', () => {
      const rawSubFlag = 'TECHX{sub_flag_step_one}';
      const storedProofHash = hashFlag(rawSubFlag);

      const submittedProof = 'TECHX{sub_flag_step_one}';
      const isMatch = timingSafeMatch(hashFlag(submittedProof.trim()), storedProofHash);
      expect(isMatch).toBe(true);

      const wrongProof = 'TECHX{wrong_sub_flag}';
      const isWrongMatch = timingSafeMatch(hashFlag(wrongProof.trim()), storedProofHash);
      expect(isWrongMatch).toBe(false);
    });

    it('validates token_proof using constant-time evaluation', () => {
      const storedToken = 'valid_session_jwt_proof_token';
      const submittedCorrect = 'valid_session_jwt_proof_token';
      const submittedWrong = 'invalid_session_proof';

      expect(timingSafeMatch(submittedCorrect, storedToken)).toBe(true);
      expect(timingSafeMatch(submittedWrong, storedToken)).toBe(false);
    });
  });
});
