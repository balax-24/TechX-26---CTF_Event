import http from 'http';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import pino from 'pino';
import { buildApp } from '../../src/app.js';
import { sanitizeLogUrl } from '../../src/utils/logger.js';
import { AuthUser } from '../../src/types/auth.js';

describe('SSE Authentication & Token Log Redaction Hardening Suite', () => {
  let app: FastifyInstance;
  let serverPort: number;
  let validToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    serverPort = typeof addr === 'object' && addr ? addr.port : 4000;

    const user: AuthUser = {
      id: 'a0000000-0000-0000-0000-000000000001',
      username: 'sse_auth_user',
      email: 'sse@techxmadras.org',
      role: 'participant',
      teamId: 'b0000000-0000-0000-0000-000000000001',
      teamRole: 'captain',
    };
    validToken = app.jwt.sign(user);
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // 1. PRODUCTION-SAFE SSE AUTHENTICATION VIA HTTPONLY COOKIE
  // ---------------------------------------------------------------------------
  describe('Production SSE Authentication', () => {
    it('rejects unauthenticated requests with 401 Unauthorized', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/leaderboard/stream',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('Authentication token missing or invalid');
    });

    it('successfully connects via HttpOnly cookie (Cookie: access_token=...) without exposing token in URL', async () => {
      // Connect to SSE stream via native HTTP request using only the Cookie header
      const ssePath = '/api/v1/leaderboard/stream'; // ZERO token in the URL!

      const res = await new Promise<{ statusCode: number; headers: any; firstChunk: string }>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: serverPort,
            path: ssePath,
            method: 'GET',
            headers: {
              // Same-origin browser request sets HttpOnly cookie:
              Cookie: `access_token=${validToken}`,
              Accept: 'text/event-stream',
            },
          },
          (resStream) => {
            resStream.on('data', (chunk) => {
              resolve({
                statusCode: resStream.statusCode || 0,
                headers: resStream.headers,
                firstChunk: chunk.toString(),
              });
              req.destroy();
            });
          }
        );
        req.on('error', reject);
        req.end();
      });

      // 1. Authenticated SSE connection established
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.headers['cache-control']).toBe('no-cache, no-transform');
      expect(res.firstChunk).toContain(': connected');

      // 2. Token was NOT in the URL
      expect(ssePath).not.toContain(validToken);
      expect(ssePath).toBe('/api/v1/leaderboard/stream');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. TOKEN LOG REDACTION REGRESSION TESTS
  // ---------------------------------------------------------------------------
  describe('Sensitive Authentication Token Log Redaction', () => {
    it('sanitizeLogUrl redacts ?token= and &token= query parameters', () => {
      const secretToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.sensitivePayload.signature';

      const url1 = `/api/v1/leaderboard/stream?token=${secretToken}`;
      const redacted1 = sanitizeLogUrl(url1);
      expect(redacted1).toBe('/api/v1/leaderboard/stream?token=[REDACTED]');
      expect(redacted1).not.toContain(secretToken);

      const url2 = `/api/v1/challenges?category=web&token=${secretToken}&limit=10`;
      const redacted2 = sanitizeLogUrl(url2);
      expect(redacted2).toBe('/api/v1/challenges?category=web&token=[REDACTED]&limit=10');
      expect(redacted2).not.toContain(secretToken);

      const url3 = `/api/v1/auth/callback?access_token=${secretToken}`;
      const redacted3 = sanitizeLogUrl(url3);
      expect(redacted3).toBe('/api/v1/auth/callback?access_token=[REDACTED]');
      expect(redacted3).not.toContain(secretToken);
    });

    it('structured pino logger redacts raw tokens from url in log records', async () => {
      let loggedOutput = '';
      const customLogger = pino(
        {
          serializers: {
            url(url: string) {
              return sanitizeLogUrl(url);
            },
          },
        },
        {
          write: (chunk: string) => {
            loggedOutput += chunk;
          },
        }
      );

      const sensitiveToken = 'ey-SUPER-SECRET-BEARER-TOKEN-99999';
      customLogger.info(
        {
          reqId: 'req-test-1',
          method: 'GET',
          url: `/api/v1/leaderboard/stream?token=${sensitiveToken}`,
        },
        'Incoming request'
      );

      const parsedLog = JSON.parse(loggedOutput);

      // Verify token is redacted in structured log object
      expect(parsedLog.url).toBe('/api/v1/leaderboard/stream?token=[REDACTED]');
      // Verify raw sensitive token is NEVER printed in the log output string
      expect(loggedOutput).not.toContain(sensitiveToken);
    });
  });
});
