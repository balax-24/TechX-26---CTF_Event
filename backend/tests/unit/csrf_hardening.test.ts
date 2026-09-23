import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { AuthUser } from '../../src/types/auth.js';
import { generateCsrfToken, verifyCsrfToken } from '../../src/middleware/csrf.middleware.js';

describe('CSRF Defense-in-Depth Matrix', () => {
  let app: FastifyInstance;
  let admin: AuthUser;
  let adminToken: string;
  const allowedOrigin = 'http://localhost:5173';
  const wrongOrigin = 'http://evil-attacker.com';

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    admin = {
      id: 'a1000000-0000-0000-0000-000000000001',
      username: 'sec_admin',
      email: 'sec_admin@test.local',
      role: 'admin',
      teamId: null,
      teamRole: null,
    };
    adminToken = app.jwt.sign(admin);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Cryptographic Token Properties', () => {
    it('generates a cryptographically bound token with random nonce and HMAC', () => {
      const token1 = generateCsrfToken(admin.id);
      const token2 = generateCsrfToken(admin.id);

      expect(token1).not.toBe(token2); // Nonce uniqueness
      expect(token1.split('.').length).toBe(2); // format: nonce.signature
      expect(verifyCsrfToken(token1, admin.id)).toBe(true);
      expect(verifyCsrfToken(token2, admin.id)).toBe(true);
    });

    it('rejects tampered or forged CSRF tokens', () => {
      const validToken = generateCsrfToken(admin.id);
      const [nonce, sig] = validToken.split('.');
      const alteredChar = sig.slice(-1) === 'a' ? 'b' : 'a';
      const tamperedToken = `${nonce}.${sig.slice(0, -1)}${alteredChar}`;

      expect(verifyCsrfToken(tamperedToken, admin.id)).toBe(false);
      expect(verifyCsrfToken('malformed_token', admin.id)).toBe(false);
      expect(verifyCsrfToken('', admin.id)).toBe(false);
    });

    it('rejects token issued for a different user (user-session binding)', () => {
      const userA = 'user-a-1111-1111-1111-111111111111';
      const userB = 'user-b-2222-2222-2222-222222222222';
      const tokenForA = generateCsrfToken(userA);

      expect(verifyCsrfToken(tokenForA, userA)).toBe(true);
      expect(verifyCsrfToken(tokenForA, userB)).toBe(false);
    });
  });

  describe('HTTP Methods & Authentication Context Matrix', () => {
    it('allows safe methods (GET) without CSRF token or origin check', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/competition/state',
        cookies: { access_token: adminToken },
      });

      expect(res.statusCode).not.toBe(403);
    });

    it('rejects cookie-authenticated mutation when CSRF token is completely missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/competition/pause',
        cookies: { access_token: adminToken },
        headers: { origin: allowedOrigin },
        payload: { reason: 'emergency pause' },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).message).toMatch(/CSRF_REQUIRED/i);
    });

    it('rejects cookie-authenticated mutation with invalid/tampered CSRF token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/competition/pause',
        cookies: { access_token: adminToken },
        headers: {
          'x-csrf-token': 'bad.signature',
          origin: allowedOrigin,
        },
        payload: { reason: 'emergency pause' },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).message).toMatch(/CSRF_INVALID/i);
    });

    it('rejects cookie-authenticated mutation when CSRF token belongs to another user', async () => {
      const otherUserToken = generateCsrfToken('different-user-uuid');
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/competition/pause',
        cookies: { access_token: adminToken },
        headers: {
          'x-csrf-token': otherUserToken,
          origin: allowedOrigin,
        },
        payload: { reason: 'emergency pause' },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).message).toMatch(/CSRF_INVALID/i);
    });

    it('rejects cookie-authenticated mutation with disallowed/attacker Origin header', async () => {
      const validToken = generateCsrfToken(admin.id);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/competition/pause',
        cookies: { access_token: adminToken, csrf_token: validToken },
        headers: {
          'x-csrf-token': validToken,
          origin: wrongOrigin,
        },
        payload: { reason: 'emergency pause' },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).message).toMatch(/Cross-origin request not permitted|ORIGIN_NOT_ALLOWED/i);
    });

    it('allows cookie-authenticated POST mutation when Origin and CSRF token are valid', async () => {
      const validToken = generateCsrfToken(admin.id);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/competition/pause',
        cookies: { access_token: adminToken, csrf_token: validToken },
        headers: {
          'x-csrf-token': validToken,
          origin: allowedOrigin,
        },
        payload: { reason: 'emergency pause' },
      });

      // Must NOT be blocked by CSRF
      if (res.statusCode === 403) {
        expect(JSON.parse(res.body).message).not.toMatch(/CSRF|Cross-origin/i);
      }
    });

    it('allows cookie-authenticated PATCH mutation when Origin and CSRF token are valid', async () => {
      const validToken = generateCsrfToken(admin.id);
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/admin/competition/config',
        cookies: { access_token: adminToken, csrf_token: validToken },
        headers: {
          'x-csrf-token': validToken,
          origin: allowedOrigin,
        },
        payload: { name: 'TechX CTF 2026 Hardened' },
      });

      if (res.statusCode === 403) {
        expect(JSON.parse(res.body).message).not.toMatch(/CSRF|Cross-origin/i);
      }
    });

    it('allows cookie-authenticated DELETE mutation when Origin and CSRF token are valid', async () => {
      const validToken = generateCsrfToken(admin.id);
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/admin/challenges/non-existent-id/checkpoints/non-existent-cp',
        cookies: { access_token: adminToken, csrf_token: validToken },
        headers: {
          'x-csrf-token': validToken,
          origin: allowedOrigin,
        },
      });

      // Bypasses CSRF and reaches downstream handler (returns 400 or 404, not 403 CSRF)
      expect([400, 404]).toContain(res.statusCode);
    });

    it('allows Bearer token requests (non-browser API client) without CSRF token or origin', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/competition/pause',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: { reason: 'api automated client pause' },
      });

      // Bearer tokens are non-ambient and not vulnerable to CSRF
      if (res.statusCode === 403) {
        expect(JSON.parse(res.body).message).not.toMatch(/CSRF/i);
      }
    });
  });

  describe('Auth Route CSRF Token Lifecycle', () => {
    it('exposes GET /api/v1/auth/csrf for authenticated users to obtain a session-bound token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/csrf',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.csrfToken).toBeDefined();
      expect(verifyCsrfToken(body.csrfToken, admin.id)).toBe(true);
    });
  });
});
