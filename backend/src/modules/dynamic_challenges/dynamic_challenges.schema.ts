import { z } from 'zod';

export const challengeInstanceParamsSchema = z.object({
  slug: z.string().min(1, 'Challenge slug is required'),
});

export const proxyParamsSchema = z.object({
  slug: z.string().min(1, 'Challenge slug is required'),
});

export type ChallengeInstanceParams = z.infer<typeof challengeInstanceParamsSchema>;
