import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { AuthUser } from '../../src/types/auth.js';
import { generateCsrfToken } from '../../src/middleware/csrf.middleware.js';
import {
  checkRateLimit,
  clearMemoryRateLimiter,
  getMemoryRateLimiterSize,
  MAX_MEMORY_STORE_CAPACITY,
} from '../../src/utils/rate_limiter.js';
import { sseManager, MAX_SSE_CONNECTIONS_PER_USER } from '../../src/modules/realtime/sse.manager.js';

describe('Stage 9 Adversarial Audit & Security Hardening Test Suite', () => {
  let app: FastifyInstance;

  const allowedOrigin = 'http://localhost:5173';
  const attackerOrigin = 'https://evil-attacker.com';

  const userA: AuthUser = {
    id: 'a0000000-0000-0000-0000-000000000001',
    username: 'participant_alice',
    email: 'alice@team-alpha.org',
    role: 'participant',
    teamId: 'b0000000-0000-0000-0000-000000000001',
    teamRole: 'captain',
  };

  const userB: AuthUser = {
    id: 'a0000000-0000-0000-0000-000000000002',
    username: 'participant_bob',
    email: 'bob@team-bravo.org',
    role: 'participant',
    teamId: 'b0000000-0000-0000-0000-000000000002',
    teamRole: 'member',
  };

  let tokenUserA: string;
  let tokenUserB: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    tokenUserA = app.jwt.sign(userA);
    tokenUserB = app.jwt.sign(userB);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    clearMemoryRateLimiter();
    sseManager.resetMetrics();
  });

  // ===========================================================================
  // 1. AUTHENTICATION SECURITY & RATE LIMITING
  // ===========================================================================
  describe('Authentication Security & Abuse Resistance', () => {
    it('enforces sliding-window rate limit on login attempts', async () => {
      const ip = '198.51.100.1';

      // Send 10 allowed attempts
      for (let i = 0; i < 10; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          remoteAddress: ip,
          payload: {
            identifier: `user_${i}`,
            password: 'wrong_password_attempt',
          },
        });
        expect([400, 401, 500]).toContain(res.statusCode);
      }

      // 11th attempt from same IP is rate-limited with 429
      const blockedRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        remoteAddress: ip,
        payload: {
          identifier: 'alice',
          password: 'another_attempt',
        },
      });

      expect(blockedRes.statusCode).toBe(429);
      expect(JSON.parse(blockedRes.body).message).toMatch(/Too many login attempts/i);
    });

    it('prevents rate-limit bypass via spoofed X-Forwarded-For, X-Real-IP, and Forwarded headers', async () => {
      const actualPeerIp = '198.51.100.77';

      // Attacker attempts 10 logins from the same actual peer IP, rotating spoofed headers on each attempt
      for (let i = 0; i < 10; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          remoteAddress: actualPeerIp,
          headers: {
            'x-forwarded-for': `10.0.0.${i}, ${actualPeerIp}`,
            'x-real-ip': `172.16.0.${i}`,
            forwarded: `for=192.168.1.${i}`,
          },
          payload: {
            identifier: `target_${i}`,
            password: 'wrong_password',
          },
        });
        expect([400, 401, 500]).toContain(res.statusCode);
      }

      // 11th attempt from the same peer IP, even with yet another spoofed header, must be blocked with 429
      const blockedRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        remoteAddress: actualPeerIp,
        headers: {
          'x-forwarded-for': `10.0.0.99, ${actualPeerIp}`,
          'x-real-ip': '172.16.0.99',
          forwarded: 'for=192.168.1.99',
        },
        payload: {
          identifier: 'target_victim',
          password: 'another_attempt',
        },
      });

      expect(blockedRes.statusCode).toBe(429);
      expect(JSON.parse(blockedRes.body).message).toMatch(/Too many login attempts/i);
    });

    it('enforces sliding-window rate limit on registration attempts', async () => {
      const ip = '198.51.100.2';

      // Send 5 attempts
      for (let i = 0; i < 5; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/register',
          remoteAddress: ip,
          payload: {
            username: `hacker_${i}`,
            email: `hacker_${i}@test.com`,
            password: 'ValidPassword123!',
          },
        });
        expect([201, 400, 409, 500]).toContain(res.statusCode);
      }

      // 6th attempt is rate-limited with 429
      const blockedRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        remoteAddress: ip,
        payload: {
          username: 'hacker_overflow',
          email: 'overflow@test.com',
          password: 'ValidPassword123!',
        },
      });

      expect(blockedRes.statusCode).toBe(429);
      expect(JSON.parse(blockedRes.body).message).toMatch(/Too many registration attempts/i);
    });

    it('rejects oversized payloads (>16KB) on auth endpoints with 413 Payload Too Large', async () => {
      const hugePadding = 'A'.repeat(20000);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          identifier: 'alice',
          password: hugePadding,
        },
      });

      expect(res.statusCode).toBe(413);
    });

    it('rejects malformed or signature-tampered JWT tokens safely with 401', async () => {
      const parts = tokenUserA.split('.');
      const tamperedToken = `${parts[0]}.${parts[1]}.tampered_signature_xyz`;

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${tamperedToken}`,
        },
      });

      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).message).toMatch(/Invalid or expired authentication token/i);
    });

    it('rejects expired or malformed JWT tokens with 401 Unauthorized', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature',
        },
      });

      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).message).toMatch(/Invalid or expired authentication token/i);
    });
  });

  // ===========================================================================
  // 2. CSRF DEFENSE MATRIX ON STATE-CHANGING MUTATIONS
  // ===========================================================================
  describe('CSRF Protection & Ambient Credential Defense Matrix', () => {
    it('allows valid authenticated request with matching CSRF token and valid Origin', async () => {
      const validToken = generateCsrfToken(userA.id);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/submissions/flag',
        cookies: {
          access_token: tokenUserA,
          csrf_token: validToken,
        },
        headers: {
          'x-csrf-token': validToken,
          origin: allowedOrigin,
        },
        payload: {
          challengeSlug: 'web-101',
          flag: 'TECHX{sample_flag}',
        },
      });

      // Does NOT fail with 403 CSRF error
      expect([200, 400, 404, 500]).toContain(res.statusCode);
      expect(res.statusCode).not.toBe(403);
    });

    it('allows valid Bearer token authentication without CSRF token (programmatic CLI support)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/submissions/flag',
        headers: {
          authorization: `Bearer ${tokenUserA}`,
        },
        payload: {
          challengeSlug: 'web-101',
          flag: 'TECHX{sample_flag}',
        },
      });

      expect([200, 400, 404, 500]).toContain(res.statusCode);
      expect(res.statusCode).not.toBe(403);
    });

    it('rejects cookie-authenticated flag submission when CSRF token is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/submissions/flag',
        cookies: {
          access_token: tokenUserA,
        },
        headers: {
          origin: allowedOrigin,
        },
        payload: {
          challengeSlug: 'web-101',
          flag: 'TECHX{sample_flag}',
        },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).message).toMatch(/CSRF_REQUIRED/i);
    });

    it('rejects cookie-authenticated flag submission with forged/tampered CSRF token', async () => {
      const validToken = generateCsrfToken(userA.id);
      const [nonce, sig] = validToken.split('.');
      const alteredChar = sig.slice(-1) === 'a' ? 'b' : 'a';
      const forgedToken = `${nonce}.${sig.slice(0, -1)}${alteredChar}`;

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/submissions/flag',
        cookies: {
          access_token: tokenUserA,
          csrf_token: validToken,
        },
        headers: {
          'x-csrf-token': forgedToken,
          origin: allowedOrigin,
        },
        payload: {
          challengeSlug: 'web-101',
          flag: 'TECHX{sample_flag}',
        },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).message).toMatch(/CSRF_INVALID/i);
    });

    it('rejects cookie-authenticated flag submission from malicious Origin', async () => {
      const validToken = generateCsrfToken(userA.id);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/submissions/flag',
        cookies: {
          access_token: tokenUserA,
          csrf_token: validToken,
        },
        headers: {
          'x-csrf-token': validToken,
          origin: attackerOrigin,
        },
        payload: {
          challengeSlug: 'web-101',
          flag: 'TECHX{sample_flag}',
        },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).message).toMatch(/Cross-origin request not permitted|ORIGIN_NOT_ALLOWED|CSRF_ORIGIN_INVALID/i);
    });

    it('rejects cookie-authenticated flag submission from malicious Referer', async () => {
      const validToken = generateCsrfToken(userA.id);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/submissions/flag',
        cookies: {
          access_token: tokenUserA,
          csrf_token: validToken,
        },
        headers: {
          'x-csrf-token': validToken,
          referer: 'https://evil-phishing-portal.com/ctf',
        },
        payload: {
          challengeSlug: 'web-101',
          flag: 'TECHX{sample_flag}',
        },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).message).toMatch(/CSRF_ORIGIN_INVALID|Cross-origin request not permitted/i);
    });

    it('rejects cookie-authenticated checkpoint validation when CSRF token is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/checkpoints/c0000000-0000-0000-0000-000000000001/validate',
        cookies: {
          access_token: tokenUserA,
        },
        headers: {
          origin: allowedOrigin,
        },
        payload: {
          proof: 'proof_material',
        },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).message).toMatch(/CSRF_REQUIRED/i);
    });

    it('rejects cookie-authenticated hint unlock when CSRF token is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/challenges/web-101/hints/h0000000-0000-0000-0000-000000000001/unlock',
        cookies: {
          access_token: tokenUserA,
        },
        headers: {
          origin: allowedOrigin,
        },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).message).toMatch(/CSRF_REQUIRED/i);
    });

    it('rejects cookie-authenticated instance start when CSRF token is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/challenges/web-101/instance',
        cookies: {
          access_token: tokenUserA,
        },
        headers: {
          origin: allowedOrigin,
        },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).message).toMatch(/CSRF_REQUIRED/i);
    });

    it('rejects cookie-authenticated team mutation when CSRF token is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/teams',
        cookies: {
          access_token: tokenUserA,
        },
        headers: {
          origin: allowedOrigin,
        },
        payload: {
          name: 'New Rogue Team',
        },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).message).toMatch(/CSRF_REQUIRED/i);
    });
  });

  // ===========================================================================
  // 3. RATE LIMITING & RESOURCE EXHAUSTION PROTECTION
  // ===========================================================================
  describe('Resource Exhaustion & Concurrency Limits', () => {
    it('enforces maximum capacity bounding on in-memory rate limiter store', async () => {
      const targetCapacity = MAX_MEMORY_STORE_CAPACITY;

      // Insert 10,020 distinct keys into the in-memory limiter
      for (let i = 0; i < targetCapacity + 20; i++) {
        await checkRateLimit(`key_${i}`, 5, 60000);
      }

      // Memory store size must never grow unbounded past capacity
      expect(getMemoryRateLimiterSize()).toBeLessThanOrEqual(targetCapacity);
    });

    it('enforces concurrent SSE connection limit per user account', async () => {
      const dummyUserId = 'test-concurrent-user-999';

      // Simulate 5 active connections registered for this user
      for (let i = 0; i < MAX_SSE_CONNECTIONS_PER_USER; i++) {
        sseManager.addClient({
          id: `client_${i}`,
          userId: dummyUserId,
          reply: { raw: { writableEnded: false, destroyed: false, write: () => true } } as any,
          connectedAt: new Date(),
          lastPingAt: Date.now(),
        });
      }

      expect(sseManager.getUserConnectionCount(dummyUserId)).toBe(MAX_SSE_CONNECTIONS_PER_USER);

      const customUserToken = app.jwt.sign({
        id: dummyUserId,
        username: 'flooder',
        email: 'flooder@ctf.test',
        role: 'participant',
        teamId: 'team-999',
        teamRole: 'member',
      });

      // 6th concurrent connection attempt is rejected with 429
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/leaderboard/stream',
        headers: {
          authorization: `Bearer ${customUserToken}`,
        },
      });

      expect(res.statusCode).toBe(429);
      expect(JSON.parse(res.body).message).toMatch(/Active SSE stream connection limit reached/i);
    });
  });

  // ===========================================================================
  // 4. PATH TRAVERSAL & INPUT VALIDATION
  // ===========================================================================
  describe('Path Traversal & Parameter Hardening', () => {
    const maliciousFileIdPayloads = [
      '../secret.txt',
      '..\\secret.txt',
      '..%2fsecret.txt',
      '%2e%2e%2fsecret.txt',
      '%2e%2e%5csecret.txt',
      '%252e%252e%252fsecret.txt',
      '/etc/passwd',
      'C:\\Windows\\System32\\drivers\\etc\\hosts',
      'secret%00.txt',
      'a'.repeat(100),
      'not-a-uuid',
      '12345',
      '00000000-0000-0000-0000',
    ];

    for (const payload of maliciousFileIdPayloads) {
      it(`rejects path traversal/invalid fileId payload: "${payload.substring(0, 30)}" with 400 Bad Request`, async () => {
        const res = await app.inject({
          method: 'GET',
          url: `/api/v1/challenges/web-101/files/${encodeURIComponent(payload)}`,
          headers: {
            authorization: `Bearer ${tokenUserA}`,
          },
        });

        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).message).toMatch(/Invalid file ID format/i);
      });
    }

    it('rejects path traversal in challenge slug parameter with 400 Bad Request', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/challenges/..%2fbadslug/files/00000000-0000-0000-0000-000000000001',
        headers: {
          authorization: `Bearer ${tokenUserA}`,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toMatch(/Invalid challenge slug format/i);
    });

    it('returns 404 when file does not belong to requested challenge (cross-challenge access blocked)', async () => {
      const { challengesService } = await import('../../src/modules/challenges/challenges.service.js');
      const spy = vi.spyOn(challengesService, 'getChallengeFile').mockResolvedValueOnce(null);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/challenges/crypto-101/files/00000000-0000-0000-0000-000000000001',
        headers: {
          authorization: `Bearer ${tokenUserA}`,
        },
      });

      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).message).toMatch(/Challenge file not found/i);
      spy.mockRestore();
    });
  });

  // ===========================================================================
  // 5. SECURITY HEADERS & ERROR SANITIZATION
  // ===========================================================================
  describe('Security Headers & Information Leakage Defense', () => {
    it('sets hardened security headers: X-Content-Type-Options, X-Frame-Options', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
    });

    it('enforces comprehensive Content-Security-Policy with all 11 required directives', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
      });

      const csp = res.headers['content-security-policy'] as string;
      expect(csp).toBeDefined();

      // Check all 11 directives
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("style-src 'self' 'unsafe-inline'");
      expect(csp).toContain("img-src 'self' data: blob:");
      expect(csp).toContain("font-src 'self' data:");
      expect(csp).toContain("connect-src 'self'");
      expect(csp).toContain("frame-src 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("form-action 'self'");
      expect(csp).toContain("frame-ancestors 'none'");

      // Verify no unsafe-eval or wildcard script sources
      expect(csp).not.toContain("'unsafe-eval'");
      expect(csp).not.toMatch(/script-src[^;]*\*/);
    });

    it('preserves semantic 4xx error codes and domain messages without masking as 500', async () => {
      // 400 Bad Request
      const badReqRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { identifier: 'a' }, // missing password
      });
      expect(badReqRes.statusCode).toBe(400);
      expect(JSON.parse(badReqRes.body).message).toBeDefined();

      // 401 Unauthorized
      const unauthRes = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
      });
      expect(unauthRes.statusCode).toBe(401);
      expect(JSON.parse(unauthRes.body).message).toMatch(/Authentication token missing/i);

      // 403 Forbidden
      const forbiddenRes = await app.inject({
        method: 'POST',
        url: '/api/v1/teams',
        cookies: { access_token: tokenUserA },
      });
      expect(forbiddenRes.statusCode).toBe(403);
      expect(JSON.parse(forbiddenRes.body).message).toMatch(/CSRF_REQUIRED/i);

      // 404 Not Found
      const notFoundRes = await app.inject({
        method: 'GET',
        url: '/api/v1/non-existent-api-path-xyz',
      });
      expect(notFoundRes.statusCode).toBe(404);
    });

    it('sanitizes unexpected internal 500 errors to prevent database and stack leakage', async () => {
      // Trigger 500 by passing malformed parameters to an internal route
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/challenges/intro-sqli-sandbox/instance/proxy/',
        headers: {
          authorization: `Bearer ${tokenUserA}`,
        },
      });

      // Client must never receive SQL syntax, DB relation names, or stack traces
      expect(res.body).not.toContain('SELECT');
      expect(res.body).not.toContain('INSERT');
      expect(res.body).not.toContain('FROM');
      expect(res.body).not.toContain('stack');
      expect(res.body).not.toContain('at Object.');
    });
  });
});
