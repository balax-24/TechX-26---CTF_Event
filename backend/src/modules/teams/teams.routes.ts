import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { teamsService } from './teams.service.js';
import { createTeamSchema, joinTeamSchema } from './teams.schema.js';
import { authenticate, requireTeam } from '../../middleware/auth.middleware.js';
import { csrfProtection } from '../../middleware/csrf.middleware.js';
import { checkRateLimit } from '../../utils/rate_limiter.js';
import { AuthUser } from '../../types/auth.js';

export const teamRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Helper to extract optional authenticated user from request without throwing 401
  const getOptionalUser = (req: any): AuthUser | null => {
    let token: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (req.cookies && req.cookies.access_token) {
      token = req.cookies.access_token;
    }

    if (!token) return null;

    try {
      return app.jwt.verify<AuthUser>(token);
    } catch {
      return null;
    }
  };

  // ---------------------------------------------------------------------------
  // 1. CREATE TEAM
  // ---------------------------------------------------------------------------
  app.post(
    '/',
    { preHandler: [authenticate, csrfProtection], bodyLimit: 16384 },
    async (req, reply) => {
      // Rate limit: 5 team creations per hour per user
      const rateLimit = await checkRateLimit(`team:create:${req.user!.id}`, 5, 3600000);
      if (!rateLimit.allowed) {
        return reply.tooManyRequests('Team creation rate limit exceeded. Please wait.');
      }

      const parseResult = createTeamSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.badRequest(parseResult.error.errors[0].message);
      }

      try {
        const result = await teamsService.createTeam(req.user!.id, parseResult.data);

        // Re-sign user token with updated teamId and teamRole
        const token = app.jwt.sign({
          id: req.user!.id,
          username: req.user!.username,
          email: req.user!.email,
          role: req.user!.role,
          teamId: result.team.id,
          teamRole: 'captain',
        });

        return reply.status(201).send({
          success: true,
          team: result.team,
          inviteCode: result.inviteCode,
          token,
        });
      } catch (err: any) {
        if (err.message === 'ALREADY_IN_TEAM') {
          return reply.badRequest('You already belong to a team');
        }
        if (err.message === 'TEAM_NAME_EXISTS') {
          return reply.conflict('A team with this name already exists');
        }
        req.log.error({ err }, 'Create team error');
        return reply.internalServerError('Failed to create team');
      }
    }
  );

  // ---------------------------------------------------------------------------
  // 2. JOIN TEAM
  // ---------------------------------------------------------------------------
  app.post(
    '/join',
    { preHandler: [authenticate, csrfProtection], bodyLimit: 16384 },
    async (req, reply) => {
      // Rate limit: 10 join attempts per 10 minutes per user (anti-brute-force for invite codes)
      const rateLimit = await checkRateLimit(`team:join:${req.user!.id}`, 10, 600000);
      if (!rateLimit.allowed) {
        return reply.tooManyRequests('Too many team join attempts. Please slow down.');
      }

      const parseResult = joinTeamSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.badRequest(parseResult.error.errors[0].message);
      }

    try {
      const team = await teamsService.joinTeam(req.user!.id, parseResult.data);

      // Re-sign user token with updated teamId and teamRole
      const token = app.jwt.sign({
        id: req.user!.id,
        username: req.user!.username,
        email: req.user!.email,
        role: req.user!.role,
        teamId: team.id,
        teamRole: 'member',
      });

      return reply.send({
        success: true,
        team,
        token,
      });
    } catch (err: any) {
      if (err.message === 'ALREADY_IN_TEAM') {
        return reply.badRequest('You already belong to a team');
      }
      if (err.message === 'INVALID_INVITE_CODE') {
        return reply.notFound('Invalid or expired team invite code');
      }
      if (err.message === 'TEAM_BANNED') {
        return reply.forbidden('This team has been disqualified or banned');
      }
      if (err.message === 'TEAM_FULL') {
        return reply.badRequest('This team has already reached the maximum member limit');
      }
      req.log.error({ err }, 'Join team error');
      return reply.internalServerError('Failed to join team');
    }
  });

  // ---------------------------------------------------------------------------
  // 3. GET CURRENT USER'S TEAM (/me)
  // ---------------------------------------------------------------------------
  app.get('/me', { preHandler: [authenticate, requireTeam] }, async (req, reply) => {
    try {
      const team = await teamsService.getTeamDetails(req.user!.teamId!, true);
      if (!team) {
        return reply.notFound('Team not found');
      }

      return reply.send({
        success: true,
        team,
      });
    } catch (err: any) {
      req.log.error({ err }, 'Get team error');
      return reply.internalServerError('Failed to retrieve team details');
    }
  });

  // ---------------------------------------------------------------------------
  // 4. GET PUBLIC TEAM PROFILE (/:id)
  // ---------------------------------------------------------------------------
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const user = getOptionalUser(req);
      const isMemberOrAdmin =
        user?.teamId === id || user?.role === 'admin' || user?.role === 'superadmin';
      const team = await teamsService.getTeamDetails(id, isMemberOrAdmin);
      if (!team) {
        return reply.notFound('Team not found');
      }

      return reply.send({
        success: true,
        team,
      });
    } catch (err: any) {
      req.log.error({ err }, 'Get public team error');
      return reply.internalServerError('Failed to retrieve team');
    }
  });

  // ---------------------------------------------------------------------------
  // 5. LEAVE TEAM
  // ---------------------------------------------------------------------------
  app.post(
    '/leave',
    { preHandler: [authenticate, requireTeam, csrfProtection] },
    async (req, reply) => {
    try {
      const result = await teamsService.leaveTeam(req.user!.id, req.user!.teamId!);

      // Re-sign token without team
      const token = app.jwt.sign({
        id: req.user!.id,
        username: req.user!.username,
        email: req.user!.email,
        role: req.user!.role,
        teamId: null,
        teamRole: null,
      });

      return reply.send({
        success: true,
        disbanded: result.disbanded,
        message: result.disbanded
          ? 'As the sole captain, your team has been disbanded'
          : 'Successfully left the team',
        token,
      });
    } catch (err: any) {
      if (err.message === 'CAPTAIN_CANNOT_LEAVE') {
        return reply.badRequest(
          'Captain cannot leave while other members remain. Disband or transfer captaincy first.'
        );
      }
      req.log.error({ err }, 'Leave team error');
      return reply.internalServerError('Failed to leave team');
    }
  });

  // ---------------------------------------------------------------------------
  // 6. LIST TEAMS
  // ---------------------------------------------------------------------------
  app.get('/', async (req, reply) => {
    const query = req.query as { limit?: string; offset?: string };
    const limit = Math.min(parseInt(query.limit || '50', 10), 100);
    const offset = Math.max(parseInt(query.offset || '0', 10), 0);

    try {
      const teamList = await teamsService.listTeams(limit, offset);
      return reply.send({
        success: true,
        teams: teamList,
      });
    } catch (err: any) {
      req.log.error({ err }, 'List teams error');
      return reply.internalServerError('Failed to retrieve teams list');
    }
  });
};
