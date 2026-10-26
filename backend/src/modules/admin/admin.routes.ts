import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { adminService } from './admin.service.js';
import { auditService } from './audit.service.js';
import { authService } from '../auth/auth.service.js';
import { competitionService } from '../competition/competition.service.js';
import { scoringService } from '../scoring/scoring.service.js';
import { leaderboardService } from '../leaderboard/leaderboard.service.js';
import { authenticate, requireRole } from '../../middleware/auth.middleware.js';
import { csrfProtection } from '../../middleware/csrf.middleware.js';
import { checkRateLimit } from '../../utils/rate_limiter.js';
import {
  createChallengeAdminSchema,
  updateChallengeAdminSchema,
  setChallengeStatusSchema,
  createCheckpointAdminSchema,
  updateCheckpointAdminSchema,
  createHintAdminSchema,
  setTeamStatusSchema,
  renameTeamSchema,
  createTeamAdminSchema,
  provisionTeamWithParticipantSchema,
  addTeamMemberAdminSchema,
  createParticipantAdminSchema,
  resetPasswordAdminSchema,
  patchUserAdminSchema,
  adminScoreAdjustmentSchema,
  setUserActiveSchema,
  setUserRoleSchema,
  paginationQuerySchema,
  auditLogQuerySchema,
  lookupTestTeamSchema,
  cleanupTestTeamSchema,
} from './admin.schema.js';
import {
  transitionStateSchema,
  updateCompetitionConfigSchema,
  emergencyPauseSchema,
  resumeCompetitionSchema,
} from '../competition/competition.schema.js';

export const adminRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Enforce server-side authentication, RBAC, and CSRF protection across all admin routes
  app.addHook('preHandler', authenticate);
  app.addHook('preHandler', requireRole(['admin', 'superadmin']));
  app.addHook('preHandler', csrfProtection);

  // Enforce password change check: if admin is flagged, they cannot perform admin actions
  app.addHook('preHandler', async (req, reply) => {
    if (req.user) {
      const mustChange = await authService.checkMustChangePassword(req.user.id, req.user.email);
      if (mustChange) {
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          code: 'FORCE_PASSWORD_CHANGE',
          message: 'Temporary password must be changed before accessing the administrative control portal.',
        });
      }
    }
  });

  // Apply administrative rate limiting (60 ops/min per admin identity)
  app.addHook('preHandler', async (req, reply) => {
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
      const rateLimitResult = await checkRateLimit(
        `admin:mutation:${req.user.id}`,
        60,
        60000
      );
      if (!rateLimitResult.allowed) {
        return reply.tooManyRequests('Admin rate limit exceeded. Please slow down.');
      }
    }
  });

  // Helper to extract verified actor from session token
  const getActor = (req: any) => ({
    id: req.user.id,
    role: req.user.role,
    ip: req.ip,
    requestId: req.id,
  });

  // ---------------------------------------------------------------------------
  // 1. COMPETITION CONTROL PLANE
  // ---------------------------------------------------------------------------

  app.get('/competition', async (_req, reply) => {
    const state = await competitionService.getCompetitionState();
    return reply.send(state);
  });

  app.get('/competition/state', async (_req, reply) => {
    const state = await competitionService.getCompetitionState();
    return reply.send(state);
  });

  app.patch('/competition/config', async (req, reply) => {
    const parseResult = updateCompetitionConfigSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.badRequest(parseResult.error.errors[0].message);
    }

    try {
      const updated = await competitionService.updateConfig({
        input: parseResult.data,
        actorUserId: req.user.id,
        actorRole: req.user.role,
        actorIp: req.ip,
        requestId: req.id,
      });
      return reply.send(updated);
    } catch (err: any) {
      return reply.badRequest(err.message);
    }
  });

  app.post('/competition/transition', async (req, reply) => {
    const parseResult = transitionStateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.badRequest(parseResult.error.errors[0].message);
    }

    try {
      const updated = await competitionService.transitionState({
        targetState: parseResult.data.targetState,
        reason: parseResult.data.reason,
        actorUserId: req.user.id,
        actorRole: req.user.role,
        actorIp: req.ip,
        requestId: req.id,
      });
      return reply.send(updated);
    } catch (err: any) {
      if (err.message.includes('INVALID_STATE_TRANSITION')) {
        return reply.status(409).send({ error: 'INVALID_STATE_TRANSITION', message: err.message });
      }
      return reply.badRequest(err.message);
    }
  });

  app.post('/competition/pause', async (req, reply) => {
    const parseResult = emergencyPauseSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.badRequest(parseResult.error.errors[0].message);
    }

    try {
      const updated = await competitionService.emergencyPause({
        reason: parseResult.data.reason,
        actorUserId: req.user.id,
        actorRole: req.user.role,
        actorIp: req.ip,
        requestId: req.id,
      });
      return reply.send(updated);
    } catch (err: any) {
      return reply.badRequest(err.message);
    }
  });

  app.post('/competition/resume', async (req, reply) => {
    const parseResult = resumeCompetitionSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.badRequest(parseResult.error.errors[0].message);
    }

    try {
      const updated = await competitionService.resumeCompetition({
        reason: parseResult.data.reason,
        actorUserId: req.user.id,
        actorRole: req.user.role,
        actorIp: req.ip,
        requestId: req.id,
      });
      return reply.send(updated);
    } catch (err: any) {
      return reply.badRequest(err.message);
    }
  });

  // ---------------------------------------------------------------------------
  // 2. CHALLENGE ADMINISTRATION
  // ---------------------------------------------------------------------------

  app.get('/challenges', async (req, reply) => {
    const parseResult = paginationQuerySchema.safeParse(req.query);
    const pagination = parseResult.success ? parseResult.data : undefined;
    const challenges = await adminService.listChallenges(pagination);
    return reply.send(challenges);
  });

  app.get('/challenges/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const challenge = await adminService.getChallenge(id);
      return reply.send(challenge);
    } catch (err: any) {
      if (err.message === 'CHALLENGE_NOT_FOUND') {
        return reply.notFound('Challenge not found');
      }
      return reply.internalServerError(err.message);
    }
  });

  app.post('/challenges', async (req, reply) => {
    const parseResult = createChallengeAdminSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.badRequest(parseResult.error.errors[0].message);
    }

    try {
      const created = await adminService.createChallenge(parseResult.data, getActor(req));
      return reply.status(201).send(created);
    } catch (err: any) {
      return reply.badRequest(err.message);
    }
  });

  app.patch('/challenges/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parseResult = updateChallengeAdminSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.badRequest(parseResult.error.errors[0].message);
    }

    try {
      const updated = await adminService.updateChallenge(id, parseResult.data, getActor(req));
      return reply.send(updated);
    } catch (err: any) {
      if (err.message.includes('CHALLENGE_LOCKED_FOR_SCORING')) {
        return reply.status(409).send({ error: 'CHALLENGE_LOCKED', message: err.message });
      }
      if (err.message.includes('INVALID_POINTS')) {
        return reply.badRequest(err.message);
      }
      if (err.message === 'CHALLENGE_NOT_FOUND') {
        return reply.notFound('Challenge not found');
      }
      return reply.badRequest(err.message);
    }
  });

  app.post('/challenges/:id/status', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parseResult = setChallengeStatusSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.badRequest(parseResult.error.errors[0].message);
    }

    try {
      const updated = await adminService.updateChallenge(
        id,
        { status: parseResult.data.status },
        getActor(req)
      );
      return reply.send(updated);
    } catch (err: any) {
      if (err.message === 'CHALLENGE_NOT_FOUND') {
        return reply.notFound('Challenge not found');
      }
      return reply.badRequest(err.message);
    }
  });

  app.post('/challenges/:id/checkpoints', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parseResult = createCheckpointAdminSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.badRequest(parseResult.error.errors[0].message);
    }

    try {
      const checkpoint = await adminService.addCheckpoint(id, parseResult.data, getActor(req));
      return reply.status(201).send(checkpoint);
    } catch (err: any) {
      if (err.message.includes('CHALLENGE_LOCKED_FOR_SCORING')) {
        return reply.status(409).send({ error: 'CHALLENGE_LOCKED', message: err.message });
      }
      if (err.message.includes('INVALID_CHECKPOINT_POINTS')) {
        return reply.badRequest(err.message);
      }
      return reply.badRequest(err.message);
    }
  });

  app.patch('/challenges/:id/checkpoints/:checkpointId', async (req, reply) => {
    const { id, checkpointId } = req.params as { id: string; checkpointId: string };
    const parseResult = updateCheckpointAdminSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.badRequest(parseResult.error.errors[0].message);
    }

    try {
      const updated = await adminService.updateCheckpoint(
        id,
        checkpointId,
        parseResult.data,
        getActor(req)
      );
      return reply.send(updated);
    } catch (err: any) {
      if (err.message.includes('CHALLENGE_LOCKED_FOR_SCORING')) {
        return reply.status(409).send({ error: 'CHALLENGE_LOCKED', message: err.message });
      }
      if (err.message.includes('INVALID_CHECKPOINT_POINTS')) {
        return reply.badRequest(err.message);
      }
      if (err.message === 'CHALLENGE_NOT_FOUND' || err.message === 'CHECKPOINT_NOT_FOUND') {
        return reply.notFound(err.message);
      }
      return reply.badRequest(err.message);
    }
  });

  app.delete('/challenges/:id/checkpoints/:checkpointId', async (req, reply) => {
    const { id, checkpointId } = req.params as { id: string; checkpointId: string };
    try {
      const result = await adminService.deleteCheckpoint(id, checkpointId, getActor(req));
      return reply.send(result);
    } catch (err: any) {
      if (err.message.includes('CHALLENGE_LOCKED_FOR_SCORING')) {
        return reply.status(409).send({ error: 'CHALLENGE_LOCKED', message: err.message });
      }
      if (err.message === 'CHALLENGE_NOT_FOUND' || err.message === 'CHECKPOINT_NOT_FOUND') {
        return reply.notFound(err.message);
      }
      return reply.badRequest(err.message);
    }
  });

  app.post('/challenges/:id/hints', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parseResult = createHintAdminSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.badRequest(parseResult.error.errors[0].message);
    }

    try {
      const hint = await adminService.addHint(id, parseResult.data, getActor(req));
      return reply.status(201).send(hint);
    } catch (err: any) {
      return reply.badRequest(err.message);
    }
  });

  // ---------------------------------------------------------------------------
  // 3. TEAM MODERATION & SCORE ADJUSTMENTS
  // ---------------------------------------------------------------------------

  app.get('/teams', async (req, reply) => {
    const parseResult = paginationQuerySchema.safeParse(req.query);
    const pagination = parseResult.success ? parseResult.data : undefined;
    const teams = await adminService.listTeams(pagination);
    return reply.send(teams);
  });

  app.post('/teams', async (req, reply) => {
    const parseResult = createTeamAdminSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.badRequest(parseResult.error.errors[0].message);
    }

    try {
      const created = await adminService.createTeam(parseResult.data, getActor(req));
      return reply.status(201).send(created);
    } catch (err: any) {
      if (err.message === 'TEAM_NAME_EXISTS') {
        return reply.conflict('Team name already taken');
      }
      if (err.message === 'USER_NOT_FOUND') {
        return reply.notFound('Captain user not found');
      }
      if (err.message === 'ALREADY_IN_TEAM') {
        return reply.badRequest('User is already in a team');
      }
      return reply.badRequest(err.message);
    }
  });

  app.post('/teams/provision', async (req, reply) => {
    const parseResult = provisionTeamWithParticipantSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.badRequest(parseResult.error.errors[0].message);
    }

    try {
      const result = await adminService.provisionTeamWithParticipant(parseResult.data, getActor(req));
      return reply.status(201).send(result);
    } catch (err: any) {
      if (err.message === 'TEAM_NAME_EXISTS') {
        return reply.conflict('Team already exists');
      }
      if (err.message === 'USERNAME_EXISTS') {
        return reply.conflict('A participant with this username already exists');
      }
      if (err.message === 'EMAIL_EXISTS') {
        return reply.conflict('Participant already exists');
      }
      if (err.message === 'WEAK_PASSWORD') {
        return reply.badRequest('Password must be at least 8 characters');
      }
      if (err.message === 'INVALID_EMAIL') {
        return reply.badRequest('Valid participant email is required');
      }
      if (err.message === 'INVALID_DERIVED_USERNAME') {
        return reply.badRequest('Invalid username derived from email. Must be 3-50 characters containing letters, numbers, underscores, hyphens, or periods');
      }
      return reply.badRequest(err.message);
    }
  });

  app.post('/test-teams/lookup', async (req, reply) => {
    const parseResult = lookupTestTeamSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.badRequest(parseResult.error.errors[0].message);
    }

    try {
      const result = await adminService.lookupTestTeamByUsername(parseResult.data.username);
      return reply.send(result);
    } catch (err: any) {
      if (err.message === 'USER_NOT_FOUND') {
        return reply.notFound('USER_NOT_FOUND: Participant does not exist');
      }
      if (err.message === 'USER_HAS_NO_TEAM') {
        return reply.badRequest('USER_HAS_NO_TEAM: Participant is not assigned to any team');
      }
      if (err.message === 'NOT_A_TEST_ACCOUNT') {
        return reply.status(403).send({
          statusCode: 403,
          error: 'NOT_A_TEST_ACCOUNT',
          message: 'REFUSED: This participant is not marked as a test account. No changes made.',
        });
      }
      return reply.badRequest(err.message);
    }
  });

  app.post('/test-teams/cleanup', async (req, reply) => {
    const parseResult = cleanupTestTeamSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.badRequest(parseResult.error.errors[0].message);
    }

    try {
      const result = await adminService.cleanupTestTeamByUsername(
        parseResult.data.username,
        parseResult.data.confirmation,
        getActor(req)
      );
      return reply.send(result);
    } catch (err: any) {
      if (err.message === 'USER_NOT_FOUND') {
        return reply.notFound('USER_NOT_FOUND: Participant does not exist');
      }
      if (err.message === 'USER_HAS_NO_TEAM') {
        return reply.badRequest('USER_HAS_NO_TEAM: Participant is not assigned to any team');
      }
      if (err.message === 'NOT_A_TEST_ACCOUNT') {
        return reply.status(403).send({
          statusCode: 403,
          error: 'NOT_A_TEST_ACCOUNT',
          message: 'REFUSED: This participant is not marked as a test account. No changes made.',
        });
      }
      if (err.message === 'CANCELLED') {
        return reply.status(400).send({
          statusCode: 400,
          error: 'CANCELLED',
          message: 'CANCELLED. No changes were made.',
        });
      }
      return reply.badRequest(err.message);
    }
  });

  app.get('/teams/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const team = await adminService.getTeam(id);
      return reply.send(team);
    } catch (err: any) {
      if (err.message === 'TEAM_NOT_FOUND') {
        return reply.notFound('Team not found');
      }
      return reply.internalServerError(err.message);
    }
  });

  app.get('/teams/:id/members', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const members = await adminService.getTeamMembers(id);
      return reply.send(members);
    } catch (err: any) {
      return reply.internalServerError(err.message);
    }
  });

  app.post('/teams/:id/members', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parseResult = addTeamMemberAdminSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.badRequest(parseResult.error.errors[0].message);
    }

    try {
      const member = await adminService.addTeamMember(id, parseResult.data, getActor(req));
      return reply.status(201).send(member);
    } catch (err: any) {
      if (err.message === 'TEAM_NOT_FOUND') {
        return reply.notFound('Team not found');
      }
      if (err.message === 'USER_NOT_FOUND') {
        return reply.notFound('User not found');
      }
      if (err.message === 'ALREADY_IN_TEAM') {
        return reply.badRequest('User already belongs to a team');
      }
      if (err.message === 'TEAM_FULL') {
        return reply.badRequest('Team is at maximum capacity (4 members)');
      }
      return reply.badRequest(err.message);
    }
  });

  app.delete('/teams/:id/members/:userId', async (req, reply) => {
    const { id, userId } = req.params as { id: string; userId: string };
    const query = req.query as { reason?: string };
    try {
      const result = await adminService.removeTeamMember(
        id,
        userId,
        query.reason || 'Admin removed team member',
        getActor(req)
      );
      return reply.send(result);
    } catch (err: any) {
      if (err.message === 'TEAM_NOT_FOUND') {
        return reply.notFound('Team not found');
      }
      if (err.message === 'MEMBER_NOT_FOUND') {
        return reply.notFound('Member not found in team');
      }
      return reply.badRequest(err.message);
    }
  });

  app.post('/teams/:id/status', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parseResult = setTeamStatusSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.badRequest(parseResult.error.errors[0].message);
    }

    try {
      const updated = await adminService.setTeamStatus(
        id,
        parseResult.data.status,
        parseResult.data.reason,
        getActor(req)
      );
      return reply.send(updated);
    } catch (err: any) {
      if (err.message === 'TEAM_NOT_FOUND') {
        return reply.notFound('Team not found');
      }
      return reply.badRequest(err.message);
    }
  });

  app.patch('/teams/:id/rename', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parseResult = renameTeamSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.badRequest(parseResult.error.errors[0].message);
    }

    try {
      const updated = await adminService.renameTeam(
        id,
        parseResult.data.name,
        parseResult.data.reason,
        getActor(req)
      );
      return reply.send(updated);
    } catch (err: any) {
      if (err.message === 'TEAM_NOT_FOUND') {
        return reply.notFound('Team not found');
      }
      if (err.message === 'TEAM_NAME_EXISTS') {
        return reply.conflict('Team name already taken');
      }
      return reply.badRequest(err.message);
    }
  });

  app.post('/teams/:id/adjust-score', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parseResult = adminScoreAdjustmentSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.badRequest(parseResult.error.errors[0].message);
    }

    // Support Idempotency-Key header fallback
    const idempotencyKey =
      parseResult.data.idempotencyKey ||
      (req.headers['idempotency-key'] as string | undefined);

    try {
      const result = await scoringService.applyAdminAdjustment({
        teamId: id,
        delta: parseResult.data.delta,
        reason: parseResult.data.reason,
        actorUserId: req.user.id,
        actorRole: req.user.role,
        actorIp: req.ip,
        idempotencyKey,
        requestId: req.id,
      });

      return reply.status(200).send(result);
    } catch (err: any) {
      if (err.message === 'TEAM_NOT_FOUND') {
        return reply.notFound('Team not found');
      }
      return reply.badRequest(err.message);
    }
  });

  // ---------------------------------------------------------------------------
  // 4. USER MODERATION
  // ---------------------------------------------------------------------------

  app.get('/users', async (req, reply) => {
    const parseResult = paginationQuerySchema.safeParse(req.query);
    const pagination = parseResult.success ? parseResult.data : undefined;
    const users = await adminService.listUsers(pagination);
    return reply.send(users);
  });

  app.post('/users', async (req, reply) => {
    const parseResult = createParticipantAdminSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.badRequest(parseResult.error.errors[0].message);
    }

    try {
      const created = await adminService.createParticipantUser(parseResult.data, getActor(req));
      return reply.status(201).send(created);
    } catch (err: any) {
      if (err.message === 'TEAM_NOT_FOUND') {
        return reply.notFound('Team not found');
      }
      if (err.message === 'USERNAME_EXISTS') {
        return reply.conflict('Username is already taken');
      }
      if (err.message === 'EMAIL_EXISTS') {
        return reply.conflict('Email is already registered');
      }
      if (err.message === 'TEAM_FULL') {
        return reply.badRequest('Team is at maximum capacity (4 members)');
      }
      return reply.badRequest(err.message);
    }
  });

  app.patch('/users/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parseResult = patchUserAdminSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.badRequest(parseResult.error.errors[0].message);
    }

    try {
      const updated = await adminService.patchUser(id, parseResult.data, getActor(req));
      return reply.send(updated);
    } catch (err: any) {
      if (err.message === 'USER_NOT_FOUND') {
        return reply.notFound('User not found');
      }
      if (err.message === 'USERNAME_EXISTS') {
        return reply.conflict('Username is already taken');
      }
      if (err.message === 'EMAIL_EXISTS') {
        return reply.conflict('Email is already registered');
      }
      return reply.badRequest(err.message);
    }
  });

  app.post('/users/:id/reset-password', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parseResult = resetPasswordAdminSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.badRequest(parseResult.error.errors[0].message);
    }

    try {
      const result = await adminService.resetUserPassword(
        id,
        parseResult.data.password,
        parseResult.data.reason,
        getActor(req)
      );
      return reply.send(result);
    } catch (err: any) {
      if (err.message === 'USER_NOT_FOUND') {
        return reply.notFound('User not found');
      }
      return reply.badRequest(err.message);
    }
  });

  app.post('/users/:id/disable', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body as { reason?: string }) || {};
    try {
      const result = await adminService.setUserActive(
        id,
        false,
        body.reason || 'Admin disabled account',
        getActor(req)
      );
      return reply.send(result);
    } catch (err: any) {
      if (err.message === 'USER_NOT_FOUND') {
        return reply.notFound('User not found');
      }
      return reply.badRequest(err.message);
    }
  });

  app.post('/users/:id/enable', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body as { reason?: string }) || {};
    try {
      const result = await adminService.setUserActive(
        id,
        true,
        body.reason || 'Admin enabled account',
        getActor(req)
      );
      return reply.send(result);
    } catch (err: any) {
      if (err.message === 'USER_NOT_FOUND') {
        return reply.notFound('User not found');
      }
      return reply.badRequest(err.message);
    }
  });

  app.post('/users/:id/status', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parseResult = setUserActiveSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.badRequest(parseResult.error.errors[0].message);
    }

    try {
      const updated = await adminService.setUserActive(
        id,
        parseResult.data.isActive,
        parseResult.data.reason,
        getActor(req)
      );
      return reply.send(updated);
    } catch (err: any) {
      if (err.message === 'USER_NOT_FOUND') {
        return reply.notFound('User not found');
      }
      return reply.badRequest(err.message);
    }
  });

  // Role changes are restricted to SUPERADMIN only
  const handleRoleUpdate = async (req: any, reply: any) => {
    const { id } = req.params as { id: string };
    const parseResult = setUserRoleSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.badRequest(parseResult.error.errors[0].message);
    }

    try {
      const updated = await adminService.setUserRole(
        id,
        parseResult.data.role,
        parseResult.data.reason,
        getActor(req)
      );
      return reply.send(updated);
    } catch (err: any) {
      if (err.message.includes('CANNOT_DEMOTE_SELF')) {
        return reply.status(409).send({ error: 'CANNOT_DEMOTE_SELF', message: err.message });
      }
      if (err.message === 'USER_NOT_FOUND') {
        return reply.notFound('User not found');
      }
      return reply.badRequest(err.message);
    }
  };

  app.post(
    '/users/:id/role',
    { preHandler: [requireRole(['superadmin'])] },
    handleRoleUpdate
  );

  app.put(
    '/users/:id/role',
    { preHandler: [requireRole(['superadmin'])] },
    handleRoleUpdate
  );

  // ---------------------------------------------------------------------------
  // 5. AUDIT LOG VIEWER (APPEND-ONLY, NO DELETE/UPDATE APIS)
  // ---------------------------------------------------------------------------

  const handleAuditLogs = async (req: any, reply: any) => {
    const parseResult = auditLogQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      return reply.badRequest(parseResult.error.errors[0].message);
    }

    const result = await auditService.getAuditLogs(parseResult.data);
    return reply.send(result);
  };

  app.get('/audit-logs', handleAuditLogs);
  app.get('/audit', handleAuditLogs);

  // ---------------------------------------------------------------------------
  // 6. OPERATIONS DASHBOARD & TELEMETRY
  // ---------------------------------------------------------------------------

  app.get('/overview', async (_req, reply) => {
    try {
      const stats = await adminService.getOverviewStats();
      return reply.send(stats);
    } catch (err: any) {
      _req.log.error({ err }, 'Overview stats error');
      return reply.internalServerError(err.message);
    }
  });

  // ---------------------------------------------------------------------------
  // 7. SUBMISSIONS MONITORING
  // ---------------------------------------------------------------------------

  app.get('/submissions', async (req, reply) => {
    try {
      const query = req.query as any;
      const result = await adminService.listSubmissions({
        page: query.page ? Number(query.page) : 1,
        limit: query.limit ? Number(query.limit) : 50,
        teamId: query.teamId,
        challengeId: query.challengeId,
        isCorrect: query.isCorrect === undefined ? undefined : query.isCorrect === 'true',
        search: query.search,
      });
      return reply.send(result);
    } catch (err: any) {
      req.log.error({ err }, 'List submissions error');
      return reply.internalServerError(err.message);
    }
  });

  app.post(
    '/submissions/:id/inspect-flag',
    { preHandler: [requireRole(['superadmin'])] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = (req.body as { reason?: string }) || {};
      try {
        const flagData = await adminService.inspectSubmissionFlag(
          id,
          getActor(req),
          body.reason || 'Superadmin flag inspection'
        );
        return reply.send(flagData);
      } catch (err: any) {
        if (err.message === 'SUBMISSION_NOT_FOUND') {
          return reply.notFound('Submission not found');
        }
        return reply.badRequest(err.message);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // 8. CHECKPOINTS & HINTS AGGREGATED VIEWS
  // ---------------------------------------------------------------------------

  app.get('/checkpoints', async (_req, reply) => {
    try {
      const list = await adminService.listAllCheckpoints();
      return reply.send(list);
    } catch (err: any) {
      return reply.internalServerError(err.message);
    }
  });

  app.get('/hints', async (_req, reply) => {
    try {
      const list = await adminService.listAllHints();
      return reply.send(list);
    } catch (err: any) {
      return reply.internalServerError(err.message);
    }
  });

  app.patch('/hints/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const updated = await adminService.updateHint(id, req.body as any, getActor(req));
      return reply.send(updated);
    } catch (err: any) {
      if (err.message === 'HINT_NOT_FOUND') {
        return reply.notFound('Hint not found');
      }
      return reply.badRequest(err.message);
    }
  });

  app.delete('/hints/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const res = await adminService.deleteHint(id, getActor(req));
      return reply.send(res);
    } catch (err: any) {
      if (err.message === 'HINT_NOT_FOUND') {
        return reply.notFound('Hint not found');
      }
      return reply.badRequest(err.message);
    }
  });

  // ---------------------------------------------------------------------------
  // 9. DYNAMIC CHALLENGE INSTANCES
  // ---------------------------------------------------------------------------

  app.get('/dynamic-instances', async (_req, reply) => {
    try {
      const instances = await adminService.listDynamicInstances();
      return reply.send(instances);
    } catch (err: any) {
      return reply.internalServerError(err.message);
    }
  });

  app.post('/dynamic-instances/cleanup-expired', async (req, reply) => {
    try {
      const res = await adminService.cleanupExpiredInstances(getActor(req));
      return reply.send(res);
    } catch (err: any) {
      return reply.internalServerError(err.message);
    }
  });

  // ---------------------------------------------------------------------------
  // 10. SCORING LEDGER & LEADERBOARD
  // ---------------------------------------------------------------------------

  app.get('/scores/ledger', async (req, reply) => {
    try {
      const query = req.query as any;
      const ledger = await adminService.getScoreLedger({
        page: query.page ? Number(query.page) : 1,
        limit: query.limit ? Number(query.limit) : 50,
        teamId: query.teamId,
      });
      return reply.send(ledger);
    } catch (err: any) {
      return reply.internalServerError(err.message);
    }
  });

  app.get('/leaderboard', async (_req, reply) => {
    try {
      const snapshot = await leaderboardService.getLeaderboardSnapshot();
      return reply.send(snapshot);
    } catch (err: any) {
      return reply.internalServerError(err.message);
    }
  });

  app.post('/leaderboard/reconcile', async (_req, reply) => {
    try {
      const snapshot = await leaderboardService.getLeaderboardSnapshot();
      return reply.send({ success: true, snapshot });
    } catch (err: any) {
      return reply.internalServerError(err.message);
    }
  });

  // ---------------------------------------------------------------------------
  // 11. ANNOUNCEMENTS
  // ---------------------------------------------------------------------------

  app.get('/announcements', async (_req, reply) => {
    try {
      const list = await adminService.listAnnouncements();
      return reply.send(list);
    } catch (err: any) {
      return reply.internalServerError(err.message);
    }
  });

  app.post('/announcements', async (req, reply) => {
    const body = req.body as any;
    if (!body?.title || !body?.content) {
      return reply.badRequest('Title and content are required');
    }
    try {
      const created = await adminService.createAnnouncement(body, getActor(req));
      return reply.status(201).send(created);
    } catch (err: any) {
      return reply.badRequest(err.message);
    }
  });

  app.delete('/announcements/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const res = await adminService.deleteAnnouncement(id, getActor(req));
      return reply.send(res);
    } catch (err: any) {
      if (err.message === 'ANNOUNCEMENT_NOT_FOUND') {
        return reply.notFound('Announcement not found');
      }
      return reply.badRequest(err.message);
    }
  });

  // ---------------------------------------------------------------------------
  // 12. BACKUPS & RESTORE
  // ---------------------------------------------------------------------------

  app.get('/backups', async (_req, reply) => {
    try {
      const backups = await adminService.listBackups();
      return reply.send(backups);
    } catch (err: any) {
      return reply.internalServerError(err.message);
    }
  });

  app.post('/backups/create', async (req, reply) => {
    try {
      const backup = await adminService.createBackup(getActor(req));
      return reply.status(201).send(backup);
    } catch (err: any) {
      return reply.internalServerError(err.message);
    }
  });

  app.post(
    '/backups/:filename/restore',
    { preHandler: [requireRole(['superadmin'])] },
    async (req, reply) => {
      const { filename } = req.params as { filename: string };
      const body = req.body as { confirmationPhrase?: string };
      if (body?.confirmationPhrase !== 'RESTORE') {
        return reply.badRequest('Must type exact phrase RESTORE to proceed');
      }

      try {
        const res = await adminService.restoreBackup(filename, body.confirmationPhrase, getActor(req));
        return reply.send(res);
      } catch (err: any) {
        return reply.badRequest(err.message);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // 13. SYSTEM HEALTH & SECURITY EVENTS
  // ---------------------------------------------------------------------------

  app.get('/system/health', async (_req, reply) => {
    try {
      const health = await adminService.getDetailedSystemHealth();
      return reply.send(health);
    } catch (err: any) {
      return reply.internalServerError(err.message);
    }
  });

  app.get('/security/events', async (req, reply) => {
    try {
      const query = req.query as any;
      const events = await adminService.getSecurityEvents({
        page: query.page ? Number(query.page) : 1,
        limit: query.limit ? Number(query.limit) : 50,
        search: query.search,
      });
      return reply.send(events);
    } catch (err: any) {
      return reply.internalServerError(err.message);
    }
  });

  // ---------------------------------------------------------------------------
  // 14. EMERGENCY CONTROLS & CENTRAL MODERATION
  // ---------------------------------------------------------------------------

  app.post('/emergency/:action', async (req, reply) => {
    const { action } = req.params as { action: any };
    const body = (req.body as { reason?: string }) || {};

    if (!['pause', 'resume', 'disable_submissions', 'enable_submissions', 'maintenance'].includes(action)) {
      return reply.badRequest('Invalid emergency action');
    }

    try {
      const res = await adminService.emergencyAction(
        action,
        body.reason || 'Emergency administrative action',
        getActor(req)
      );
      return reply.send(res);
    } catch (err: any) {
      return reply.badRequest(err.message);
    }
  });

  app.post('/moderation/users/:id/ban', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body as { reason?: string }) || {};
    try {
      const res = await adminService.setUserActive(id, false, body.reason || 'Admin banned participant', getActor(req));
      return reply.send(res);
    } catch (err: any) {
      return reply.badRequest(err.message);
    }
  });

  app.post('/moderation/users/:id/unban', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body as { reason?: string }) || {};
    try {
      const res = await adminService.setUserActive(id, true, body.reason || 'Admin unbanned participant', getActor(req));
      return reply.send(res);
    } catch (err: any) {
      return reply.badRequest(err.message);
    }
  });

  app.post('/moderation/teams/:id/disqualify', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body as { reason?: string }) || {};
    try {
      const res = await adminService.setTeamStatus(id, 'disqualified', body.reason || 'Admin disqualified team', getActor(req));
      return reply.send(res);
    } catch (err: any) {
      return reply.badRequest(err.message);
    }
  });

  app.post('/moderation/teams/:id/restore', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body as { reason?: string }) || {};
    try {
      const res = await adminService.setTeamStatus(id, 'active', body.reason || 'Admin restored team', getActor(req));
      return reply.send(res);
    } catch (err: any) {
      return reply.badRequest(err.message);
    }
  });

  // ---------------------------------------------------------------------------
  // 15. DATA EXPORTS (CSV)
  // ---------------------------------------------------------------------------

  app.get('/export/:type', async (req, reply) => {
    const { type } = req.params as { type: any };
    if (!['teams', 'participants', 'leaderboard', 'submissions', 'audit'].includes(type)) {
      return reply.badRequest('Invalid export type. Supported: teams, participants, leaderboard, submissions, audit');
    }

    try {
      const csvData = await adminService.exportData(type);
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="techx_${type}_export_${Date.now()}.csv"`);
      return reply.send(csvData);
    } catch (err: any) {
      return reply.badRequest(err.message);
    }
  });
};
