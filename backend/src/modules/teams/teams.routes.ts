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
  // ---------------------------------------------------------------------------
  // 1. CREATE TEAM (DISABLED - Teams are admin-provisioned only)
  // ---------------------------------------------------------------------------
  app.post(
    '/',
    { preHandler: [authenticate, csrfProtection], bodyLimit: 16384 },
    async (_req, reply) => {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Self-service team creation is disabled. Teams are provisioned by tournament administrators.',
        code: 'TEAM_CREATION_DISABLED',
      });
    }
  );

  // ---------------------------------------------------------------------------
  // 2. JOIN TEAM (DISABLED - Team rosters are admin-provisioned only)
  // ---------------------------------------------------------------------------
  app.post(
    '/join',
    { preHandler: [authenticate, csrfProtection], bodyLimit: 16384 },
    async (_req, reply) => {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Public team joining is disabled. Team rosters are provisioned by tournament administrators.',
        code: 'TEAM_JOIN_DISABLED',
      });
    }
  );

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
  // 5. LEAVE TEAM (DISABLED - Team rosters are admin-provisioned only)
  // ---------------------------------------------------------------------------
  app.post(
    '/leave',
    { preHandler: [authenticate, csrfProtection] },
    async (_req, reply) => {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Self-service team modifications are disabled. Contact a tournament administrator.',
        code: 'TEAM_LEAVE_DISABLED',
      });
    }
  );

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
