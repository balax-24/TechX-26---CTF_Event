import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { submissionsService } from './submissions.service.js';
import { submitFlagSchema } from './submissions.schema.js';
import { authenticate, requireTeam } from '../../middleware/auth.middleware.js';
import { csrfProtection } from '../../middleware/csrf.middleware.js';
import { checkRateLimit } from '../../utils/rate_limiter.js';
import { config } from '../../config/env.js';

export const submissionRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post(
    '/flag',
    { preHandler: [authenticate, requireTeam, csrfProtection], bodyLimit: 16384 },
    async (req, reply) => {
      const teamId = req.user!.teamId!;

      // 1. Schema validation
      const parseResult = submitFlagSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.badRequest(parseResult.error.errors[0].message);
      }

      // 2. Sliding-window rate limit check per team
      const rateLimitResult = await checkRateLimit(
        `flag:${teamId}`,
        config.FLAG_SUBMIT_LIMIT_PER_WINDOW,
        config.FLAG_SUBMIT_WINDOW_MS
      );

      if (!rateLimitResult.allowed) {
        return reply.tooManyRequests(
          `Too many flag submission attempts. Please wait before submitting again.`
        );
      }

      const isAdmin = req.user?.role === 'admin' || req.user?.role === 'superadmin';

      try {
        const result = await submissionsService.submitFlag({
          userId: req.user!.id,
          teamId,
          input: parseResult.data,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] as string | undefined,
          isAdmin,
        });

        return reply.send(result);
      } catch (err: any) {
        if (err.message === 'COMPETITION_PAUSED') {
          return reply.forbidden('The competition is currently paused');
        }
        if (err.message === 'COMPETITION_ENDED' || err.message === 'COMPETITION_ARCHIVED') {
          return reply.forbidden('The competition has ended');
        }
        if (err.message === 'COMPETITION_NOT_ACTIVE' || err.message === 'SUBMISSIONS_DISABLED') {
          return reply.forbidden('Submissions are not permitted at this time');
        }
        if (err.message === 'ADMIN_PARTICIPATION_FORBIDDEN') {
          return reply.forbidden('Administrators cannot participate in CTF submissions');
        }
        if (err.message === 'TEAM_DISQUALIFIED') {
          return reply.forbidden('Team has been disqualified');
        }
        if (err.message === 'TEAM_DISABLED') {
          return reply.forbidden('Team is currently disabled');
        }
        if (err.message === 'CHALLENGE_NOT_FOUND') {
          return reply.notFound('Challenge not found or not yet released');
        }

        req.log.error({ err }, 'Flag submission error');
        return reply.internalServerError('Failed to process flag submission');
      }
    }
  );
};
