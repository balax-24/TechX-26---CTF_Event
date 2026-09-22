import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import sensible from '@fastify/sensible';
import jwt from '@fastify/jwt';
import { randomUUID } from 'crypto';

import { config } from './config/env.js';
import { logger, sanitizeLogUrl } from './utils/logger.js';
import { checkDatabaseHealth } from './db/index.js';
import { checkRedisHealth } from './cache/redis.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { teamRoutes } from './modules/teams/teams.routes.js';
import { challengeRoutes } from './modules/challenges/challenges.routes.js';
import { dynamicChallengeRoutes } from './modules/dynamic_challenges/dynamic_challenges.routes.js';
import { categoryRoutes } from './modules/categories/categories.routes.js';
import { submissionRoutes } from './modules/submissions/submissions.routes.js';
import { checkpointRoutes } from './modules/checkpoints/checkpoints.routes.js';
import { leaderboardRoutes } from './modules/leaderboard/leaderboard.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { competitionRoutes } from './modules/competition/competition.routes.js';
import { sseManager } from './modules/realtime/sse.manager.js';
import { outboxWorker } from './modules/realtime/outbox.worker.js';
import { redisSubscriber } from './modules/realtime/redis.subscriber.js';
import { instanceCleanupWorker } from './modules/dynamic_challenges/cleanup.worker.js';


export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false, // We use our structured pino logger explicitly
    genReqId: () => randomUUID(),
    trustProxy: true,
    disableRequestLogging: config.NODE_ENV === 'test',
  });

  // 1. Sensible HTTP Errors
  await app.register(sensible);

  // 2. Helmet Security Headers
  await app.register(helmet, {
    contentSecurityPolicy: config.NODE_ENV === 'production',
    crossOriginEmbedderPolicy: false,
  });

  // 3. CORS Configuration
  const allowedOrigins = config.CORS_ORIGIN.split(',').map((origin) => origin.trim());
  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return cb(null, true);
      }
      return cb(new Error('CORS Not Allowed'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Handle CORS and Origin Rejection cleanly with 403 ORIGIN_NOT_ALLOWED
  app.setErrorHandler((error, _request, reply) => {
    if (error.message === 'CORS Not Allowed') {
      return reply.status(403).send({
        statusCode: 403,
        error: 'ORIGIN_NOT_ALLOWED',
        message: 'Cross-origin request not permitted',
      });
    }
    reply.send(error);
  });

  // 4. Secure Cookie Signing
  await app.register(cookie, {
    secret: config.COOKIE_SECRET,
    hook: 'onRequest',
  });

  // 5. JWT Authentication Engine
  await app.register(jwt, {
    secret: config.JWT_SECRET,
    sign: {
      expiresIn: config.JWT_EXPIRES_IN,
    },
  });

  // 6. Request Lifecycle Logging (with strict query credential redaction)
  app.addHook('onRequest', async (req) => {
    if (req.url !== '/health' && config.NODE_ENV !== 'test') {
      logger.info(
        {
          reqId: req.id,
          method: req.method,
          url: sanitizeLogUrl(req.url),
          ip: req.ip,
        },
        'Incoming request'
      );
    }
  });

  app.addHook('onResponse', async (req, reply) => {
    if (req.url !== '/health' && config.NODE_ENV !== 'test') {
      logger.info(
        {
          reqId: req.id,
          method: req.method,
          url: sanitizeLogUrl(req.url),
          statusCode: reply.statusCode,
          responseTimeMs: Math.round(reply.elapsedTime),
        },
        'Request completed'
      );
    }
  });

  // ---------------------------------------------------------------------------
  // 7. HEALTH PROBES
  // ---------------------------------------------------------------------------

  // Liveness probe (Fast check for Docker container liveness)
  app.get('/health', async (_req, reply) => {
    return reply.status(200).send({
      status: 'ok',
      uptimeSeconds: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // Readiness probe (Deep check verifying DB & Redis connectivity)
  app.get('/api/v1/health', async (_req, reply) => {
    const [dbHealth, redisHealth] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth(),
    ]);

    const isHealthy = dbHealth.status === 'healthy' && redisHealth.status === 'healthy';
    const isDegraded = dbHealth.status === 'healthy' || redisHealth.status === 'healthy';

    const responseStatus = isHealthy ? 'ok' : isDegraded ? 'degraded' : 'down';
    const httpStatusCode = isHealthy ? 200 : isDegraded ? 200 : 503;

    return reply.status(httpStatusCode).send({
      status: responseStatus,
      deploymentMode: config.DEPLOYMENT_MODE,
      competitionState: config.COMPETITION_STATE,
      uptimeSeconds: process.uptime(),
      timestamp: new Date().toISOString(),
      services: {
        database: dbHealth,
        redis: redisHealth,
      },
    });
  });

  // ---------------------------------------------------------------------------
  // 8. BASE API ROUTE & FEATURE MODULES
  // ---------------------------------------------------------------------------
  app.get('/api/v1', async (_req, reply) => {
    return reply.send({
      name: 'TechX CTF Core API',
      version: '1.0.0',
      event: 'TechX Madras 2026',
      status: 'operational',
      docs: '/api/v1/docs',
    });
  });

  // Mount Feature Modules
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(teamRoutes, { prefix: '/api/v1/teams' });
  await app.register(challengeRoutes, { prefix: '/api/v1/challenges' });
  await app.register(dynamicChallengeRoutes, { prefix: '/api/v1/challenges' });
  await app.register(categoryRoutes, { prefix: '/api/v1/categories' });
  await app.register(submissionRoutes, { prefix: '/api/v1/submissions' });
  await app.register(checkpointRoutes, { prefix: '/api/v1/checkpoints' });
  await app.register(leaderboardRoutes, { prefix: '/api/v1/leaderboard' });
  await app.register(adminRoutes, { prefix: '/api/v1/admin' });
  await app.register(competitionRoutes, { prefix: '/api/v1/competition' });

  // Lifecycle cleanup hook on application close
  app.addHook('onClose', async () => {
    sseManager.closeAll();
    await redisSubscriber.stop();
    outboxWorker.stop();
    instanceCleanupWorker.stop();
  });

  return app;
}



