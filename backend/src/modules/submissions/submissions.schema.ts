import { z } from 'zod';

export const submitFlagSchema = z
  .object({
    challengeId: z.string().uuid().optional(),
    challengeSlug: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/)
      .optional(),
    flag: z.string().min(1, 'Flag is required').max(500, 'Flag exceeds maximum length'),
  })
  .refine((data) => data.challengeId || data.challengeSlug, {
    message: 'Either challengeId or challengeSlug must be provided',
  });

export type SubmitFlagInput = z.infer<typeof submitFlagSchema>;
