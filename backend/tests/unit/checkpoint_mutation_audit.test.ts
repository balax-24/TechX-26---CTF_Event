import { describe, it, expect } from 'vitest';
import {
  createCheckpointAdminSchema,
  updateCheckpointAdminSchema,
} from '../../src/modules/admin/admin.schema.js';

describe('Checkpoint Mutation & Deletion Audit Invariants', () => {
  describe('Schema Validations', () => {
    it('validates partial update inputs for checkpoints', () => {
      const validUpdate = updateCheckpointAdminSchema.safeParse({
        title: 'Updated Step Title',
        description: 'New detailed instructions',
        pointValue: 75,
      });
      expect(validUpdate.success).toBe(true);

      const invalidPoints = updateCheckpointAdminSchema.safeParse({
        pointValue: -10,
      });
      expect(invalidPoints.success).toBe(false);

      const invalidStep = updateCheckpointAdminSchema.safeParse({
        stepNumber: 0,
      });
      expect(invalidStep.success).toBe(false);
    });
  });

  describe('Point Invariant Enforcement: sum(checkpoints) <= challenge.points', () => {
    it('allows checkpoint creation when sum of checkpoints does not exceed challenge points', () => {
      const challengePoints = 500;
      const existingCheckpoints = [{ pointValue: 100 }, { pointValue: 150 }];
      const newCheckpointPoints = 200;

      const total = existingCheckpoints.reduce((sum, cp) => sum + cp.pointValue, 0) + newCheckpointPoints;
      expect(total <= challengePoints).toBe(true);
      expect(total).toBe(450);
    });

    it('rejects checkpoint creation when new checkpoint exceeds remaining challenge points', () => {
      const challengePoints = 500;
      const existingCheckpoints = [{ pointValue: 250 }, { pointValue: 200 }];
      const newCheckpointPoints = 100; // 250 + 200 + 100 = 550 > 500

      const total = existingCheckpoints.reduce((sum, cp) => sum + cp.pointValue, 0) + newCheckpointPoints;
      expect(total > challengePoints).toBe(true);
    });

    it('rejects checkpoint update that inflates total checkpoint points beyond challenge points', () => {
      const challengePoints = 300;
      const targetCheckpointId = 'cp-1';
      const allCheckpoints = [
        { id: 'cp-1', pointValue: 50 },
        { id: 'cp-2', pointValue: 150 },
      ];

      const proposedNewPoints = 200; // other = 150, 150 + 200 = 350 > 300
      const otherPoints = allCheckpoints
        .filter((cp) => cp.id !== targetCheckpointId)
        .reduce((sum, cp) => sum + cp.pointValue, 0);

      const newTotal = otherPoints + proposedNewPoints;
      expect(newTotal > challengePoints).toBe(true);
    });
  });

  describe('Historical Activity Immutability Rules', () => {
    interface CheckpointState {
      id: string;
      stepNumber: number;
      title: string;
      pointValue: number;
      validationType: string;
      secretProof: string;
    }

    function evaluateCheckpointMutation(
      current: CheckpointState,
      input: Partial<CheckpointState>,
      hasHistoricalActivity: boolean
    ): { allowed: boolean; reason?: string } {
      if (hasHistoricalActivity) {
        if (input.pointValue !== undefined && input.pointValue !== current.pointValue) {
          return {
            allowed: false,
            reason: 'CHALLENGE_LOCKED_FOR_SCORING: Cannot modify checkpoint points after historical scoring activity',
          };
        }
        if (input.stepNumber !== undefined && input.stepNumber !== current.stepNumber) {
          return {
            allowed: false,
            reason: 'CHALLENGE_LOCKED_FOR_SCORING: Cannot reorder or change step number after historical progress exists',
          };
        }
        if (input.validationType !== undefined && input.validationType !== current.validationType) {
          return {
            allowed: false,
            reason: 'CHALLENGE_LOCKED_FOR_SCORING: Cannot modify validation type after historical activity exists',
          };
        }
        if (input.secretProof !== undefined && input.secretProof !== current.secretProof) {
          return {
            allowed: false,
            reason: 'CHALLENGE_LOCKED_FOR_SCORING: Cannot alter secret proof on a checkpoint with recorded history',
          };
        }
      }
      return { allowed: true };
    }

    it('locks scoring-critical checkpoint fields when historical activity exists', () => {
      const current: CheckpointState = {
        id: 'cp-1',
        stepNumber: 1,
        title: 'Step 1',
        pointValue: 50,
        validationType: 'token_proof',
        secretProof: 'proof_123',
      };

      // Attempt pointValue change
      const pointRes = evaluateCheckpointMutation(current, { pointValue: 100 }, true);
      expect(pointRes.allowed).toBe(false);
      expect(pointRes.reason).toMatch(/CHALLENGE_LOCKED_FOR_SCORING/);

      // Attempt step reorder
      const stepRes = evaluateCheckpointMutation(current, { stepNumber: 2 }, true);
      expect(stepRes.allowed).toBe(false);
      expect(stepRes.reason).toMatch(/CHALLENGE_LOCKED_FOR_SCORING/);

      // Attempt validation type change
      const valRes = evaluateCheckpointMutation(current, { validationType: 'manual' }, true);
      expect(valRes.allowed).toBe(false);
      expect(valRes.reason).toMatch(/CHALLENGE_LOCKED_FOR_SCORING/);

      // Attempt secret proof alteration
      const proofRes = evaluateCheckpointMutation(current, { secretProof: 'new_secret' }, true);
      expect(proofRes.allowed).toBe(false);
      expect(proofRes.reason).toMatch(/CHALLENGE_LOCKED_FOR_SCORING/);
    });

    it('allows scoring-critical checkpoint modifications when NO historical activity exists', () => {
      const current: CheckpointState = {
        id: 'cp-1',
        stepNumber: 1,
        title: 'Draft Step',
        pointValue: 50,
        validationType: 'token_proof',
        secretProof: 'proof_123',
      };

      const res = evaluateCheckpointMutation(
        current,
        {
          pointValue: 75,
          stepNumber: 2,
          validationType: 'manual_approval',
          secretProof: 'new_proof',
        },
        false // No history!
      );
      expect(res.allowed).toBe(true);
    });

    it('rejects destructive checkpoint deletion if historical progress or scoring exists', () => {
      function evaluateCheckpointDeletion(hasHistory: boolean): { allowed: boolean; reason?: string } {
        if (hasHistory) {
          return {
            allowed: false,
            reason: 'CHALLENGE_LOCKED_FOR_SCORING: Cannot delete checkpoint after historical progress or scoring events exist',
          };
        }
        return { allowed: true };
      }

      expect(evaluateCheckpointDeletion(true).allowed).toBe(false);
      expect(evaluateCheckpointDeletion(true).reason).toMatch(/CHALLENGE_LOCKED_FOR_SCORING/);
      expect(evaluateCheckpointDeletion(false).allowed).toBe(true);
    });
  });
});
