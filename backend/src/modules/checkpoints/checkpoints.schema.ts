import { z } from 'zod';

export const validateCheckpointParamsSchema = z.object({
  checkpointId: z.string().uuid('Invalid checkpoint ID format'),
});

export const validateCheckpointBodySchema = z.object({
  proof: z.string().min(1, 'Proof string or token is required').max(500),
});

export type ValidateCheckpointBody = z.infer<typeof validateCheckpointBodySchema>;

// -----------------------------------------------------------------------------
// AUTHORING-TIME SCHEMAS & VALIDATORS
// -----------------------------------------------------------------------------
export const checkpointConfigSchema = z.object({
  stepNumber: z.number().int().min(1, 'Step number must be at least 1'),
  title: z.string().min(1, 'Checkpoint title is required').max(150),
  description: z.string().default(''),
  pointValue: z.number().int().min(0, 'Point value cannot be negative'),
  validationType: z.enum(['token_proof', 'sub_flag', 'server_callback']).default('token_proof'),
  secretProofHash: z.string().min(1, 'Secret proof hash is required'),
});

export type CheckpointConfig = z.infer<typeof checkpointConfigSchema>;

export const challengeCheckpointsAuthoringSchema = z
  .object({
    challengePoints: z.number().int().min(1, 'Challenge points must be at least 1'),
    checkpoints: z.array(checkpointConfigSchema),
  })
  .refine(
    (data) => {
      const totalPoints = data.checkpoints.reduce((sum, cp) => sum + cp.pointValue, 0);
      return totalPoints <= data.challengePoints;
    },
    {
      message: 'Total checkpoint points cannot exceed challenge points',
      path: ['checkpoints'],
    }
  );

export type ChallengeCheckpointsAuthoringInput = z.infer<
  typeof challengeCheckpointsAuthoringSchema
>;

/**
 * Validates authoring-time checkpoint points allocation.
 * Enforces: SUM(checkpoints.pointValue) <= challengePoints
 */
export function validateCheckpointAllocation(
  challengePoints: number,
  checkpointsList: Array<{ pointValue: number }>
): { valid: boolean; error?: string; totalCheckpointPoints: number } {
  const totalCheckpointPoints = checkpointsList.reduce((sum, cp) => sum + cp.pointValue, 0);
  if (totalCheckpointPoints > challengePoints) {
    return {
      valid: false,
      error: `Total checkpoint points (${totalCheckpointPoints}) exceeds challenge points (${challengePoints})`,
      totalCheckpointPoints,
    };
  }
  return { valid: true, totalCheckpointPoints };
}

