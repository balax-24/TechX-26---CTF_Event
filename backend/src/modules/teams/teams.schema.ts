import { z } from 'zod';

export const createTeamSchema = z.object({
  name: z
    .string()
    .min(3, 'Team name must be at least 3 characters')
    .max(50, 'Team name cannot exceed 50 characters')
    .regex(/^[a-zA-Z0-9 _-]+$/, 'Team name can only contain alphanumeric characters, spaces, underscores, and dashes')
    .transform((val) => val.trim()),
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const joinTeamSchema = z.object({
  inviteCode: z
    .string()
    .min(6, 'Invite code is invalid')
    .max(30, 'Invite code is invalid')
    .transform((val) => val.trim().toUpperCase()),
});

export type JoinTeamInput = z.infer<typeof joinTeamSchema>;
