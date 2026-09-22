import { z } from 'zod';

export const submitFlagSchema = z.object({
  challengeSlug: z
    .string()
    .min(1, 'Challenge slug is required')
    .regex(/^[a-z0-9-]+$/, 'Invalid challenge slug format'),
  flag: z.string().min(1, 'Flag is required').max(500, 'Flag exceeds maximum length'),
});

export type SubmitFlagInput = z.infer<typeof submitFlagSchema>;
