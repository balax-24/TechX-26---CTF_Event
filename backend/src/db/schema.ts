import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  smallint,
  bigint,
  boolean,
  timestamp,
  jsonb,
  inet,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// -----------------------------------------------------------------------------
// 1. USERS
// -----------------------------------------------------------------------------
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    username: varchar('username', { length: 50 }).notNull().unique(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    role: varchar('role', { length: 20 }).notNull().default('participant'), // 'participant', 'admin', 'superadmin'
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    usernameIdx: uniqueIndex('idx_users_username').on(table.username),
    emailIdx: uniqueIndex('idx_users_email').on(table.email),
  })
);

// -----------------------------------------------------------------------------
// 2. TEAMS
// -----------------------------------------------------------------------------
export const teams = pgTable(
  'teams',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 100 }).notNull().unique(),
    inviteCodeHash: varchar('invite_code_hash', { length: 255 }).notNull(),
    captainId: uuid('captain_id').notNull().references(() => users.id),
    score: integer('score').notNull().default(0),
    lastScoreAt: timestamp('last_score_at', { withTimezone: true }).notNull().defaultNow(),
    isBanned: boolean('is_banned').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    teamScoreTiebreakIdx: index('idx_teams_score_tiebreak').on(table.score, table.lastScoreAt),
    teamNameIdx: uniqueIndex('idx_teams_name').on(table.name),
  })
);

// -----------------------------------------------------------------------------
// 3. TEAM MEMBERS
// -----------------------------------------------------------------------------
export const teamMembers = pgTable(
  'team_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 20 }).notNull().default('member'), // 'captain', 'member'
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    teamMemberTeamIdx: index('idx_team_members_team_id').on(table.teamId),
    teamMemberUserIdx: uniqueIndex('idx_team_members_user_id').on(table.userId),
  })
);

// -----------------------------------------------------------------------------
// 4. CATEGORIES
// -----------------------------------------------------------------------------
export const categories = pgTable(
  'categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 50 }).notNull().unique(),
    slug: varchar('slug', { length: 50 }).notNull().unique(),
    description: text('description'),
    displayOrder: integer('display_order').notNull().default(0),
  },
  (table) => ({
    catSlugIdx: uniqueIndex('idx_categories_slug').on(table.slug),
  })
);

// -----------------------------------------------------------------------------
// 5. CHALLENGES
// -----------------------------------------------------------------------------
export const challenges = pgTable(
  'challenges',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    categoryId: uuid('category_id').notNull().references(() => categories.id),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    title: varchar('title', { length: 150 }).notNull(),
    description: text('description').notNull(),
    story: text('story'),
    difficulty: varchar('difficulty', { length: 20 }).notNull(), // 'beginner', 'intermediate', 'expert'
    points: integer('points').notNull().default(100),
    flagHash: varchar('flag_hash', { length: 255 }).notNull(),
    isDynamicHmac: boolean('is_dynamic_hmac').notNull().default(false),
    status: varchar('status', { length: 20 }).notNull().default('draft'), // 'draft', 'published', 'hidden', 'archived'
    releaseTime: timestamp('release_time', { withTimezone: true }),
    maxAttempts: integer('max_attempts'), // NULL = unlimited
    author: varchar('100', { length: 100 }).notNull(),
    connectionInfo: text('connection_info'),
    solveCount: integer('solve_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    chalSlugIdx: uniqueIndex('idx_challenges_slug').on(table.slug),
    chalStatusCategoryIdx: index('idx_challenges_status_category').on(table.status, table.categoryId),
  })
);

// -----------------------------------------------------------------------------
// 6. CHALLENGE FILES
// -----------------------------------------------------------------------------
export const challengeFiles = pgTable(
  'challenge_files',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    challengeId: uuid('challenge_id').notNull().references(() => challenges.id, { onDelete: 'cascade' }),
    filename: varchar('filename', { length: 255 }).notNull(),
    filePath: varchar('file_path', { length: 500 }).notNull(),
    fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }).notNull(),
    sha256Checksum: varchar('sha256_checksum', { length: 64 }).notNull(),
    isProtected: boolean('is_protected').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    chalFilesChalIdx: index('idx_challenge_files_challenge_id').on(table.challengeId),
  })
);

// -----------------------------------------------------------------------------
// 7. CHECKPOINTS
// -----------------------------------------------------------------------------
export const checkpoints = pgTable(
  'checkpoints',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    challengeId: uuid('challenge_id').notNull().references(() => challenges.id, { onDelete: 'cascade' }),
    stepNumber: smallint('step_number').notNull(),
    title: varchar('title', { length: 150 }).notNull(),
    description: text('description').notNull(),
    pointValue: integer('point_value').notNull().default(0),
    validationType: varchar('validation_type', { length: 30 }).notNull().default('token_proof'),
    secretProofHash: varchar('secret_proof_hash', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    chalStepUnique: uniqueIndex('idx_checkpoints_chal_step').on(table.challengeId, table.stepNumber),
  })
);

// -----------------------------------------------------------------------------
// 8. CHECKPOINT PROGRESS
// -----------------------------------------------------------------------------
export const checkpointProgress = pgTable(
  'checkpoint_progress',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    checkpointId: uuid('checkpoint_id').notNull().references(() => checkpoints.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id),
    solvedAt: timestamp('solved_at', { withTimezone: true }).notNull().defaultNow(),
    proofMetadata: jsonb('proof_metadata'),
  },
  (table) => ({
    teamCheckpointUnique: uniqueIndex('idx_checkpoint_progress_team_cp').on(table.teamId, table.checkpointId),
  })
);

// -----------------------------------------------------------------------------
// 9. SUBMISSIONS
// -----------------------------------------------------------------------------
export const submissions = pgTable(
  'submissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id),
    challengeId: uuid('challenge_id').notNull().references(() => challenges.id, { onDelete: 'cascade' }),
    checkpointId: uuid('checkpoint_id').references(() => checkpoints.id),
    submittedFlag: varchar('submitted_flag', { length: 500 }).notNull(),
    isCorrect: boolean('is_correct').notNull(),
    ipAddress: varchar('ip_address', { length: 45 }).notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    submissionTeamChalIdx: index('idx_submissions_team_chal').on(table.teamId, table.challengeId),
    submissionCreatedIdx: index('idx_submissions_created').on(table.createdAt),
  })
);

// -----------------------------------------------------------------------------
// 10. TEAM SOLVES (Materialized Table with Hard Unique Constraint)
// -----------------------------------------------------------------------------
export const teamSolves = pgTable(
  'team_solves',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    challengeId: uuid('challenge_id').notNull().references(() => challenges.id, { onDelete: 'cascade' }),
    solvedByUserId: uuid('solved_by_user_id').notNull().references(() => users.id),
    solvedAt: timestamp('solved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    teamChalUnique: uniqueIndex('idx_team_solves_team_chal').on(table.teamId, table.challengeId),
  })
);

// -----------------------------------------------------------------------------
// 11. SCORE EVENTS (Immutable Accounting Ledger)
// -----------------------------------------------------------------------------
export const scoreEvents = pgTable(
  'score_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    challengeId: uuid('challenge_id').references(() => challenges.id),
    checkpointId: uuid('checkpoint_id').references(() => checkpoints.id),
    hintId: uuid('hint_id'),
    eventType: varchar('event_type', { length: 30 }).notNull(), // 'final_solve', 'checkpoint_solve', 'hint_penalty', 'admin_adjustment'
    points: integer('points').notNull(),
    runningTeamScore: integer('running_team_score').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    scoreEventTeamCreatedIdx: index('idx_score_events_team_created').on(table.teamId, table.createdAt),
  })
);

// -----------------------------------------------------------------------------
// 12. HINTS & TEAM HINTS
// -----------------------------------------------------------------------------
export const hints = pgTable('hints', {
  id: uuid('id').defaultRandom().primaryKey(),
  challengeId: uuid('challenge_id').notNull().references(() => challenges.id, { onDelete: 'cascade' }),
  orderNumber: smallint('order_number').notNull(),
  content: text('content').notNull(),
  penaltyPoints: integer('penalty_points').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const teamHints = pgTable(
  'team_hints',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    hintId: uuid('hint_id').notNull().references(() => hints.id, { onDelete: 'cascade' }),
    unlockedByUserId: uuid('unlocked_by_user_id').notNull().references(() => users.id),
    unlockedAt: timestamp('unlocked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    teamHintUnique: uniqueIndex('idx_team_hints_team_hint').on(table.teamId, table.hintId),
  })
);

// -----------------------------------------------------------------------------
// 13. ANNOUNCEMENTS
// -----------------------------------------------------------------------------
export const announcements = pgTable('announcements', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: varchar('title', { length: 200 }).notNull(),
  content: text('content').notNull(),
  authorId: uuid('author_id').notNull().references(() => users.id),
  isPinned: boolean('is_pinned').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------------------------------------------------------------
// 14. AUDIT LOGS
// -----------------------------------------------------------------------------
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorId: uuid('actor_id').references(() => users.id),
    actorIp: varchar('actor_ip', { length: 45 }).notNull(),
    action: varchar('action', { length: 100 }).notNull(),
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    entityId: varchar('entity_id', { length: 100 }),
    detailsJson: jsonb('details_json'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    auditActionCreatedIdx: index('idx_audit_logs_action_created').on(table.action, table.createdAt),
  })
);

// -----------------------------------------------------------------------------
// 15. SYSTEM CONFIGURATION
// -----------------------------------------------------------------------------
export const systemConfig = pgTable('system_config', {
  key: varchar('key', { length: 100 }).primaryKey(),
  valueJson: jsonb('value_json').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
