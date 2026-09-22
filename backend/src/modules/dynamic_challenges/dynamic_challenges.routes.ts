import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { dynamicChallengesService } from './dynamic_challenges.service.js';
import { challengeInstanceParamsSchema } from './dynamic_challenges.schema.js';
import { authenticate, requireTeam } from '../../middleware/auth.middleware.js';
import * as http from 'http';

export const dynamicChallengeRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // ---------------------------------------------------------------------------
  // 1. START / GET ACTIVE INSTANCE (Idempotent)
  // ---------------------------------------------------------------------------
  app.post(
    '/:slug/instance',
    { preHandler: [authenticate, requireTeam] },
    async (req, reply) => {
      const parseResult = challengeInstanceParamsSchema.safeParse(req.params);
      if (!parseResult.success) {
        return reply.badRequest(parseResult.error.errors[0].message);
      }

      const isAdmin = req.user?.role === 'admin' || req.user?.role === 'superadmin';

      try {
        const instance = await dynamicChallengesService.startInstance({
          slug: parseResult.data.slug,
          userId: req.user!.id,
          teamId: req.user!.teamId!,
          ipAddress: req.ip,
          isAdmin,
        });

        return reply.status(200).send({
          success: true,
          instance,
        });
      } catch (err: any) {
        return handleDomainError(err, reply, req.log);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // 2. GET INSTANCE STATUS
  // ---------------------------------------------------------------------------
  app.get(
    '/:slug/instance',
    { preHandler: [authenticate, requireTeam] },
    async (req, reply) => {
      const parseResult = challengeInstanceParamsSchema.safeParse(req.params);
      if (!parseResult.success) {
        return reply.badRequest(parseResult.error.errors[0].message);
      }

      try {
        const instance = await dynamicChallengesService.getInstanceStatus({
          slug: parseResult.data.slug,
          teamId: req.user!.teamId!,
        });

        return reply.send({
          success: true,
          instance,
        });
      } catch (err: any) {
        return handleDomainError(err, reply, req.log);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // 3. STOP / DESTROY INSTANCE
  // ---------------------------------------------------------------------------
  app.delete(
    '/:slug/instance',
    { preHandler: [authenticate, requireTeam] },
    async (req, reply) => {
      const parseResult = challengeInstanceParamsSchema.safeParse(req.params);
      if (!parseResult.success) {
        return reply.badRequest(parseResult.error.errors[0].message);
      }

      try {
        await dynamicChallengesService.stopInstance({
          slug: parseResult.data.slug,
          userId: req.user!.id,
          teamId: req.user!.teamId!,
          ipAddress: req.ip,
        });

        return reply.send({
          success: true,
          message: 'Instance stopped successfully',
        });
      } catch (err: any) {
        return handleDomainError(err, reply, req.log);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // 4. RESET INSTANCE (Stop Old -> Fresh Container -> Ready)
  // ---------------------------------------------------------------------------
  app.post(
    '/:slug/instance/reset',
    { preHandler: [authenticate, requireTeam] },
    async (req, reply) => {
      const parseResult = challengeInstanceParamsSchema.safeParse(req.params);
      if (!parseResult.success) {
        return reply.badRequest(parseResult.error.errors[0].message);
      }

      const isAdmin = req.user?.role === 'admin' || req.user?.role === 'superadmin';

      try {
        const instance = await dynamicChallengesService.resetInstance({
          slug: parseResult.data.slug,
          userId: req.user!.id,
          teamId: req.user!.teamId!,
          ipAddress: req.ip,
          isAdmin,
        });

        return reply.send({
          success: true,
          instance,
        });
      } catch (err: any) {
        return handleDomainError(err, reply, req.log);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // 5. AUTHORIZED REVERSE PROXY GATEWAY (Zero SSRF)
  // ---------------------------------------------------------------------------
  const proxyHandler = async (req: any, reply: any) => {
    const { slug } = req.params as { slug: string };

    let target: { internalIp: string; internalPort: number };
    try {
      target = await dynamicChallengesService.getProxyTarget({
        slug,
        teamId: req.user!.teamId!,
      });
    } catch (err: any) {
      return handleDomainError(err, reply, req.log);
    }

    const subpath = req.params['*'] || '';
    const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    const upstreamPath = '/' + subpath.replace(/^\//, '') + queryString;

    return new Promise<void>((resolve) => {
      const proxyReq = http.request(
        {
          host: target.internalIp,
          port: target.internalPort,
          path: upstreamPath,
          method: req.method,
          headers: {
            ...req.headers,
            host: `${target.internalIp}:${target.internalPort}`,
            'x-forwarded-for': req.ip,
            'x-forwarded-proto': 'http',
          },
          timeout: 10000,
        },
        (proxyRes) => {
          reply.status(proxyRes.statusCode || 200);
          for (const [key, value] of Object.entries(proxyRes.headers)) {
            if (key.toLowerCase() !== 'transfer-encoding' && value !== undefined) {
              reply.header(key, value);
            }
          }
          reply.send(proxyRes);
          resolve();
        }
      );

      proxyReq.on('error', (err) => {
        req.log.error({ err: err.message }, 'Upstream challenge proxy error');
        reply.status(502).send({
          statusCode: 502,
          error: 'BAD_GATEWAY',
          message: 'Challenge instance is not responding or unreachable',
        });
        resolve();
      });

      proxyReq.on('timeout', () => {
        proxyReq.destroy();
        reply.status(504).send({
          statusCode: 504,
          error: 'GATEWAY_TIMEOUT',
          message: 'Challenge instance request timed out',
        });
        resolve();
      });

      if (req.body && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')) {
        if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
          proxyReq.write(req.body);
        } else {
          proxyReq.write(JSON.stringify(req.body));
        }
      }
      proxyReq.end();
    });
  };

  app.all('/:slug/instance/proxy', { preHandler: [authenticate, requireTeam] }, proxyHandler);
  app.all('/:slug/instance/proxy/*', { preHandler: [authenticate, requireTeam] }, proxyHandler);
};

function handleDomainError(err: any, reply: any, log: any) {
  const msg = err.message;
  if (msg === 'COMPETITION_PAUSED') {
    return reply.forbidden('The competition is currently paused');
  }
  if (msg === 'COMPETITION_ENDED' || msg === 'COMPETITION_ARCHIVED') {
    return reply.forbidden('The competition has ended');
  }
  if (msg === 'COMPETITION_NOT_ACTIVE' || msg === 'SUBMISSIONS_DISABLED') {
    return reply.forbidden('Challenge instances are not permitted at this time');
  }
  if (msg === 'TEAM_DISQUALIFIED') {
    return reply.forbidden('Team has been disqualified');
  }
  if (msg === 'TEAM_DISABLED') {
    return reply.forbidden('Team is currently disabled');
  }
  if (msg === 'ADMIN_PARTICIPATION_FORBIDDEN') {
    return reply.forbidden('Administrators cannot spawn participant challenge instances');
  }
  if (msg === 'CHALLENGE_NOT_FOUND' || msg === 'CHALLENGE_NOT_RELEASED') {
    return reply.notFound('Challenge not found or not yet released');
  }
  if (msg === 'CHALLENGE_NOT_DYNAMIC') {
    return reply.badRequest('This challenge does not provide a dynamic container environment');
  }
  if (msg === 'INSTANCE_NOT_FOUND') {
    return reply.notFound('No active instance found for this challenge');
  }
  if (msg === 'INSTANCE_NOT_RUNNING') {
    return reply.badRequest('Challenge instance is not currently running');
  }
  if (msg === 'INSTANCE_EXPIRED') {
    return reply.gone('Challenge instance has expired');
  }
  if (msg === 'TEAM_INSTANCE_LIMIT_EXCEEDED') {
    return reply.status(429).send({
      statusCode: 429,
      error: 'TOO_MANY_REQUESTS',
      message: 'Active instance limit reached. Please stop an existing instance before starting a new one.',
    });
  }
  if (msg === 'CHALLENGE_CAPACITY_EXCEEDED') {
    return reply.status(503).send({
      statusCode: 503,
      error: 'SERVICE_UNAVAILABLE',
      message: 'Platform dynamic challenge capacity reached. Please try again shortly.',
    });
  }
  if (msg === 'INSTANCE_START_FAILED') {
    return reply.internalServerError('Failed to initialize challenge container. Please try again.');
  }

  log.error({ err }, 'Unhandled error in dynamic challenge routes');
  return reply.internalServerError('An unexpected error occurred');
}
