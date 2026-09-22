import { z } from 'zod';

export const challengeFilterSchema = z.object({
  category: z.string().optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'expert']).optional(),
});

export type ChallengeFilterInput = z.infer<typeof challengeFilterSchema>;

export const unlockHintParamsSchema = z.object({
  slug: z.string().min(1),
  hintId: z.string().uuid(),
});

export type UnlockHintParams = z.infer<typeof unlockHintParamsSchema>;

export const checkpointParamsSchema = z.object({
  checkpointId: z.string().uuid(),
});

export const validateCheckpointSchema = z.object({
  proof: z.string().min(1, 'Proof is required').max(500),
});

export type ValidateCheckpointInput = z.infer<typeof validateCheckpointSchema>;
