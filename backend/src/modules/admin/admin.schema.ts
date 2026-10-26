import { z } from 'zod';

// -----------------------------------------------------------------------------
// 1. CHALLENGE ADMINISTRATION SCHEMAS
// -----------------------------------------------------------------------------
export const createChallengeAdminSchema = z.object({
  title: z.string().min(2).max(150),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9-_]+$/, 'Slug must contain only lowercase alphanumeric characters, dashes, and underscores'),
  categoryId: z.string().uuid(),
  description: z.string().min(5),
  story: z.string().optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'expert']),
  points: z.number().int().min(1, 'Points must be at least 1'),
  flag: z.string().min(1, 'Flag is required'),
  isDynamicHmac: z.boolean().default(false),
  status: z.enum(['draft', 'published', 'hidden', 'archived']).default('draft'),
  releaseTime: z.string().datetime().nullable().optional(),
  maxAttempts: z.number().int().min(1).nullable().optional(),
  author: z.string().min(2).max(100),
  connectionInfo: z.string().max(500).optional(),
});

export type CreateChallengeAdminInput = z.infer<typeof createChallengeAdminSchema>;

export const updateChallengeAdminSchema = z.object({
  title: z.string().min(2).max(150).optional(),
  description: z.string().min(5).optional(),
  story: z.string().optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'expert']).optional(),
  points: z.number().int().min(1).optional(),
  flag: z.string().min(1).optional(),
  status: z.enum(['draft', 'published', 'hidden', 'archived']).optional(),
  releaseTime: z.string().datetime().nullable().optional(),
  maxAttempts: z.number().int().min(1).nullable().optional(),
  author: z.string().min(2).max(100).optional(),
  connectionInfo: z.string().max(500).nullable().optional(),
});

export type UpdateChallengeAdminInput = z.infer<typeof updateChallengeAdminSchema>;

export const setChallengeStatusSchema = z.object({
  status: z.enum(['draft', 'published', 'hidden', 'archived']),
  reason: z.string().min(3).optional(),
});

export const createCheckpointAdminSchema = z.object({
  stepNumber: z.number().int().min(1),
  title: z.string().min(2).max(150),
  description: z.string().min(5),
  pointValue: z.number().int().min(0, 'Point value must be non-negative'),
  validationType: z.enum(['token_proof', 'manual_approval']).default('token_proof'),
  secretProof: z.string().min(1, 'Secret proof is required'),
});

export type CreateCheckpointAdminInput = z.infer<typeof createCheckpointAdminSchema>;

export const updateCheckpointAdminSchema = z.object({
  stepNumber: z.number().int().min(1).optional(),
  title: z.string().min(2).max(100).optional(),
  description: z.string().max(2000).optional(),
  pointValue: z.number().int().min(0).optional(),
  validationType: z.enum(['token_proof', 'manual_approval']).optional(),
  secretProof: z.string().min(1).optional(),
});

export type UpdateCheckpointAdminInput = z.infer<typeof updateCheckpointAdminSchema>;

export const createHintAdminSchema = z.object({
  orderNumber: z.number().int().min(1),
  content: z.string().min(3),
  penaltyPoints: z.number().int().min(0).default(0),
});

export type CreateHintAdminInput = z.infer<typeof createHintAdminSchema>;

// -----------------------------------------------------------------------------
// 2. TEAM MODERATION SCHEMAS
// -----------------------------------------------------------------------------
export const setTeamStatusSchema = z.object({
  status: z.enum(['active', 'disabled', 'disqualified']),
  reason: z.string().min(3, 'Reason of at least 3 characters is required'),
});

export type SetTeamStatusInput = z.infer<typeof setTeamStatusSchema>;

export const renameTeamSchema = z.object({
  name: z.string().min(2).max(100),
  reason: z.string().min(3, 'Reason of at least 3 characters is required'),
});

export type RenameTeamInput = z.infer<typeof renameTeamSchema>;

export const adminScoreAdjustmentSchema = z.object({
  delta: z
    .number()
    .int()
    .refine((val) => val !== 0, 'Adjustment delta must be a non-zero integer')
    .refine((val) => Math.abs(val) <= 100_000, 'Adjustment delta must be between -100,000 and +100,000'),
  reason: z.string().min(5, 'A clear reason of at least 5 characters is required for score adjustments'),
  idempotencyKey: z.string().max(128).optional(),
});

export type AdminScoreAdjustmentInput = z.infer<typeof adminScoreAdjustmentSchema>;

export const createTeamAdminSchema = z.object({
  name: z.string().min(2).max(100),
  captainId: z.string().uuid().optional(),
  reason: z.string().min(3).optional(),
});

export type CreateTeamAdminInput = z.infer<typeof createTeamAdminSchema>;

export const addTeamMemberAdminSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['captain', 'member']).default('member'),
  reason: z.string().min(3).optional(),
});

export type AddTeamMemberAdminInput = z.infer<typeof addTeamMemberAdminSchema>;

// -----------------------------------------------------------------------------
// 3. USER MODERATION & PROVISIONING SCHEMAS
// -----------------------------------------------------------------------------
export function deriveUsernameFromEmail(email: string): string {
  const localPart = email.trim().split('@')[0] || '';
  return localPart;
}

export const provisionTeamWithParticipantSchema = z.object({
  teamName: z
    .string()
    .min(2, 'Team name must be at least 2 characters')
    .max(100, 'Team name cannot exceed 100 characters'),
  email: z.string().email('Valid participant email is required').max(255),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password cannot exceed 128 characters'),
  username: z
    .string()
    .min(3, 'Username must be between 3 and 50 characters')
    .max(50, 'Username must be between 3 and 50 characters')
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Username may only contain alphanumeric characters, underscores, hyphens, and periods')
    .optional(),
  reason: z.string().min(3).optional(),
});

export type ProvisionTeamWithParticipantInput = z.infer<typeof provisionTeamWithParticipantSchema>;

export const createParticipantAdminSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Username may only contain alphanumeric characters, underscores, hyphens, and periods'),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  teamId: z.string().uuid(),
  roleInTeam: z.enum(['captain', 'member']).default('member'),
  reason: z.string().min(3).optional(),
});

export type CreateParticipantAdminInput = z.infer<typeof createParticipantAdminSchema>;

export const resetPasswordAdminSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  reason: z.string().min(3, 'Reason of at least 3 characters is required'),
});

export type ResetPasswordAdminInput = z.infer<typeof resetPasswordAdminSchema>;

export const patchUserAdminSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Username may only contain alphanumeric characters, underscores, hyphens, and periods')
    .optional(),
  email: z.string().email().optional(),
  isActive: z.boolean().optional(),
  reason: z.string().min(3, 'Reason of at least 3 characters is required'),
});

export type PatchUserAdminInput = z.infer<typeof patchUserAdminSchema>;

export const setUserActiveSchema = z.object({
  isActive: z.boolean(),
  reason: z.string().min(3, 'Reason of at least 3 characters is required'),
});

export const setUserRoleSchema = z.object({
  role: z.enum(['participant', 'admin', 'superadmin']),
  reason: z.string().min(3, 'Reason of at least 3 characters is required'),
});

// -----------------------------------------------------------------------------
// 4. AUDIT LOG & LIST QUERY SCHEMAS
// -----------------------------------------------------------------------------
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const auditLogQuerySchema = z.object({
  action: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  actorId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// -----------------------------------------------------------------------------
// 5. TEST TEAM LOOKUP & CLEANUP SCHEMAS
// -----------------------------------------------------------------------------
export const lookupTestTeamSchema = z.object({
  username: z
    .string()
    .min(1, 'Participant username is required')
    .max(50, 'Username cannot exceed 50 characters')
    .trim(),
});

export type LookupTestTeamInput = z.infer<typeof lookupTestTeamSchema>;

export const cleanupTestTeamSchema = z.object({
  username: z
    .string()
    .min(1, 'Participant username is required')
    .max(50, 'Username cannot exceed 50 characters')
    .trim(),
  confirmation: z.string().min(1, 'Confirmation string is required').trim(),
  reason: z.string().min(3).optional(),
});

export type CleanupTestTeamInput = z.infer<typeof cleanupTestTeamSchema>;

/**
 * Strict verification that an account is designated as a test account.
 * Enforces the test account safety gate specified in Part 5:
 * Only accounts matching explicit test prefixes (test_, test-, techx_test_, etc.)
 * may be deleted by test cleanup utilities. Real competition accounts are strictly refused.
 */
export function isTestAccount(username: string, teamName?: string): boolean {
  const normalizedUser = username.trim().toLowerCase();
  const userMatches =
    normalizedUser.startsWith('test_') ||
    normalizedUser.startsWith('test-') ||
    normalizedUser.startsWith('techx_test_') ||
    normalizedUser.startsWith('testuser') ||
    normalizedUser.startsWith('team_test_') ||
    normalizedUser.startsWith('team_interactive_test_') ||
    normalizedUser.startsWith('team_bat_') ||
    normalizedUser.startsWith('qa_') ||
    normalizedUser.startsWith('ui_') ||
    normalizedUser === 'sentinel' ||
    normalizedUser === 'shivani';

  const normalizedTeam = (teamName || '').trim().toLowerCase();
  const teamMatches =
    normalizedTeam.startsWith('test_') ||
    normalizedTeam.startsWith('test-') ||
    normalizedTeam.startsWith('techx_test_') ||
    normalizedTeam.startsWith('team_test_') ||
    normalizedTeam.startsWith('team_interactive_test_') ||
    normalizedTeam.startsWith('team_bat_') ||
    normalizedTeam.startsWith('alpha solvers') ||
    normalizedTeam.startsWith('ui validation') ||
    normalizedTeam === 'techx_sentinels' ||
    normalizedTeam === 'techboss';

  return userMatches || teamMatches;
}

