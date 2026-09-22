import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { adminService } from './admin.service.js';
import { auditService } from './audit.service.js';
import { competitionService } from '../competition/competition.service.js';
import { scoringService } from '../scoring/scoring.service.js';
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
  adminScoreAdjustmentSchema,
  setUserActiveSchema,
  setUserRoleSchema,
  paginationQuerySchema,
  auditLogQuerySchema,
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
};
