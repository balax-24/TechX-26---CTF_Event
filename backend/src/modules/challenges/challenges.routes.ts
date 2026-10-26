import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { challengesService } from './challenges.service.js';
import {
  challengeFilterSchema,
  unlockHintParamsSchema,
} from './challenges.schema.js';
import { authenticate, requireTeam } from '../../middleware/auth.middleware.js';
import { csrfProtection } from '../../middleware/csrf.middleware.js';
import { checkRateLimit } from '../../utils/rate_limiter.js';
import { AuthUser } from '../../types/auth.js';
import * as path from 'path';
import * as fs from 'fs';

import { challengeSandboxRoutes } from './challenge_sandbox.routes.js';

const downloadFileParamsSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Invalid challenge slug format'),
  fileId: z.string().uuid('Invalid file ID format'),
});

export const challengeRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Mount interactive sandbox challenge routes
  await app.register(challengeSandboxRoutes);

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
  // 1. LIST CHALLENGES
  // ---------------------------------------------------------------------------
  app.get('/', async (req, reply) => {
    const parseResult = challengeFilterSchema.safeParse(req.query);
    if (!parseResult.success) {
      return reply.badRequest(parseResult.error.errors[0].message);
    }

    const user = getOptionalUser(req);
    const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

    try {
      const challengeList = await challengesService.listChallenges(
        parseResult.data,
        user?.teamId,
        isAdmin
      );

      return reply.send({
        success: true,
        challenges: challengeList,
      });
    } catch (err: any) {
      req.log.error({ err }, 'Error listing challenges');
      return reply.internalServerError('Failed to retrieve challenges');
    }
  });

  // ---------------------------------------------------------------------------
  // 2. GET CHALLENGE DETAILS
  // ---------------------------------------------------------------------------
  app.get('/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const user = getOptionalUser(req);
    const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

    try {
      const challenge = await challengesService.getChallengeBySlug(slug, user?.teamId, isAdmin);
      if (!challenge) {
        return reply.notFound('Challenge not found or not yet released');
      }

      return reply.send({
        success: true,
        challenge,
      });
    } catch (err: any) {
      req.log.error({ err }, 'Error fetching challenge details');
      return reply.internalServerError('Failed to retrieve challenge');
    }
  });

  // ---------------------------------------------------------------------------
  // 3. UNLOCK HINT
  // ---------------------------------------------------------------------------
  app.post(
    '/:slug/hints/:hintId/unlock',
    { preHandler: [authenticate, requireTeam, csrfProtection] },
    async (req, reply) => {
      const parseResult = unlockHintParamsSchema.safeParse(req.params);
      if (!parseResult.success) {
        return reply.badRequest(parseResult.error.errors[0].message);
      }

      // Rate limit: 10 hint unlocks per minute per team
      const rateLimit = await checkRateLimit(`hint:${req.user!.teamId}`, 10, 60000);
      if (!rateLimit.allowed) {
        return reply.tooManyRequests('Too many hint unlock requests. Please wait.');
      }

      try {
        const result = await challengesService.unlockHint(
          parseResult.data.slug,
          parseResult.data.hintId,
          req.user!.id,
          req.user!.teamId!
        );

        return reply.send({
          success: true,
          hint: result,
        });
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
        if (err.message === 'TEAM_DISQUALIFIED') {
          return reply.forbidden('Team has been disqualified');
        }
        if (err.message === 'TEAM_DISABLED') {
          return reply.forbidden('Team is currently disabled');
        }
        if (err.message === 'TEAM_NOT_FOUND') {
          return reply.badRequest('Team not found or invalid');
        }
        if (err.message === 'HINT_NOT_FOUND') {
          return reply.notFound('Hint not found for this challenge');
        }
        if (err.code === '23505') {
          return reply.send({ success: true, hint: { alreadyUnlocked: true, penaltyPoints: 0 } });
        }
        req.log.error({ err }, 'Error unlocking hint');
        return reply.internalServerError('Failed to unlock hint');
      }
    }
  );

  // ---------------------------------------------------------------------------
  // 4. DOWNLOAD CHALLENGE FILE (X-Accel-Redirect)
  // ---------------------------------------------------------------------------
  app.get(
    '/:slug/files/:fileId',
    { preHandler: [authenticate, requireTeam] },
    async (req, reply) => {
      // 1. Strict parameter schema validation (prevents path traversal / non-UUID params)
      const paramsResult = downloadFileParamsSchema.safeParse(req.params);
      if (!paramsResult.success) {
        return reply.badRequest(paramsResult.error.errors[0].message);
      }

      const { slug, fileId } = paramsResult.data;

      // 2. Rate limiting: 30 downloads per minute per team
      const rateLimit = await checkRateLimit(`file:${req.user?.teamId || req.ip}`, 30, 60000);
      if (!rateLimit.allowed) {
        return reply.tooManyRequests('File download rate limit exceeded. Please wait.');
      }

      const isAdmin = req.user?.role === 'admin' || req.user?.role === 'superadmin';

      try {
        const file = await challengesService.getChallengeFile(
          slug,
          fileId,
          req.user!.teamId,
          isAdmin
        );

        if (!file) {
          return reply.notFound('Challenge file not found');
        }

        const filename = file.filename;
        const normalizedBase = path.basename(file.filePath);

        // Strict path traversal defense: ensure normalizedBase contains no relative navigation
        if (
          !normalizedBase ||
          normalizedBase === '.' ||
          normalizedBase.includes('..') ||
          /[\/\\]/.test(normalizedBase)
        ) {
          req.log.error({ filePath: file.filePath }, 'Suspicious challenge filePath in database');
          return reply.internalServerError('Invalid challenge file configuration');
        }

        // In NGINX production or LAN deployment, delegate file serving via X-Accel-Redirect
        reply.header('X-Accel-Redirect', `/protected_storage/${normalizedBase}`);
        reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        reply.header('Content-Type', 'application/octet-stream');

        // Development/Test fallback: stream file directly if file exists on disk
        if (fs.existsSync(file.filePath)) {
          const stream = fs.createReadStream(file.filePath);
          return reply.send(stream);
        }

        return reply.send();
      } catch (err: any) {
        req.log.error({ err }, 'Error downloading challenge file');
        return reply.internalServerError('Failed to download challenge file');
      }
    }
  );
};
