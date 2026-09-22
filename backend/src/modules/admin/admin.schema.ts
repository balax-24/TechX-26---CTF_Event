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
  delta: z.number().int().refine((val) => val !== 0, 'Adjustment delta must be a non-zero integer'),
  reason: z.string().min(5, 'A clear reason of at least 5 characters is required for score adjustments'),
  idempotencyKey: z.string().max(128).optional(),
});

export type AdminScoreAdjustmentInput = z.infer<typeof adminScoreAdjustmentSchema>;

// -----------------------------------------------------------------------------
// 3. USER MODERATION SCHEMAS
// -----------------------------------------------------------------------------
export const setUserActiveSchema = z.object({
  isActive: z.boolean(),
  reason: z.string().min(3, 'Reason of at least 3 characters is required'),
});

export const setUserRoleSchema = z.object({
  role: z.enum(['participant', 'admin', 'superadmin']),
  reason: z.string().min(3, 'Reason of at least 3 characters is required'),
});

// -----------------------------------------------------------------------------
// 4. AUDIT LOG QUERY SCHEMA
// -----------------------------------------------------------------------------
export const auditLogQuerySchema = z.object({
  action: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  actorId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
