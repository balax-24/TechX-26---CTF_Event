import { z } from 'zod';

export const validateCheckpointParamsSchema = z.object({
  checkpointId: z.string().uuid('Invalid checkpoint ID format'),
});

export const validateCheckpointBodySchema = z.object({
  proof: z.string().min(1, 'Proof string or token is required').max(500),
});

export type ValidateCheckpointBody = z.infer<typeof validateCheckpointBodySchema>;
