import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'crypto';
import { leaderboardService } from './leaderboard.service.js';
import { sseManager, MAX_SSE_CONNECTIONS_PER_USER } from '../realtime/sse.manager.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  SSE_EVENT_LEADERBOARD_SNAPSHOT,
} from '../realtime/realtime.constants.js';

export const leaderboardRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  /**
   * GET /api/v1/leaderboard
   * Returns current authoritative snapshot of the competition leaderboard.
   */
  app.get('/', async (_req, reply) => {
    const snapshot = await leaderboardService.getLeaderboardSnapshot();
    return reply.status(200).send(snapshot);
  });

  /**
   * GET /api/v1/leaderboard/stream
   * Authenticated SSE stream fanning out real-time leaderboard updates.
   */
  app.get(
    '/stream',
    {
      preHandler: [authenticate],
    },
    async (req, reply) => {
      // 0. Enforce concurrent active SSE connection limit per user account
      if (sseManager.getUserConnectionCount(req.user.id) >= MAX_SSE_CONNECTIONS_PER_USER) {
        return reply.status(429).send({
          statusCode: 429,
          error: 'TOO_MANY_REQUESTS',
          message: 'Active SSE stream connection limit reached for this account',
        });
      }

      // 1. Hijack response to maintain persistent SSE stream without Fastify auto-termination
      reply.hijack();
      const rawRes = reply.raw;

      rawRes.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      if (typeof (rawRes as any).flushHeaders === 'function') {
        (rawRes as any).flushHeaders();
      }

      const clientId = randomUUID();
      const client = {
        id: clientId,
        userId: req.user.id,
        teamId: req.user.teamId ?? null,
        reply,
        connectedAt: new Date(),
        lastPingAt: Date.now(),
      };

      // 2. Register with connection manager
      sseManager.addClient(client);

      // 3. Send initial connected greeting comment & authoritative snapshot
      try {
        rawRes.write(': connected\n\n');

        // Immediately send current authoritative snapshot for fast initial page load or reconnect
        const snapshot = await leaderboardService.getLeaderboardSnapshot();
        const snapshotMessage = `event: ${SSE_EVENT_LEADERBOARD_SNAPSHOT}\ndata: ${JSON.stringify(
          snapshot
        )}\n\n`;
        rawRes.write(snapshotMessage);
      } catch (writeErr) {
        sseManager.removeClient(clientId);
        return;
      }

      // 4. Handle client disconnection
      req.raw.on('close', () => {
        sseManager.removeClient(clientId);
      });
    }
  );
};
