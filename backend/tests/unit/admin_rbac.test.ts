import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { AuthUser } from '../../src/types/auth.js';

describe('Admin RBAC & Route Isolation Matrix', () => {
  let app: FastifyInstance;
  let participantToken: string;
  let adminToken: string;
  let superadminToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const participant: AuthUser = {
      id: 'p0000000-0000-0000-0000-000000000001',
      username: 'hacker_one',
      email: 'hacker@test.local',
      role: 'participant',
      teamId: 't0000000-0000-0000-0000-000000000001',
      teamRole: 'member',
    };
    participantToken = app.jwt.sign(participant);

    const admin: AuthUser = {
      id: 'a0000000-0000-0000-0000-000000000001',
      username: 'admin_user',
      email: 'admin@test.local',
      role: 'admin',
      teamId: null,
      teamRole: null,
    };
    adminToken = app.jwt.sign(admin);

    const superadmin: AuthUser = {
      id: 's0000000-0000-0000-0000-000000000001',
      username: 'superadmin_user',
      email: 'superadmin@test.local',
      role: 'superadmin',
      teamId: null,
      teamRole: null,
    };
    superadminToken = app.jwt.sign(superadmin);
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // 1. UNAUTHENTICATED ACCESS
  // ---------------------------------------------------------------------------
  describe('Unauthenticated Access', () => {
    it('rejects unauthenticated requests to GET /api/v1/admin/competition/state with 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/competition/state',
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects unauthenticated requests to GET /api/v1/admin/challenges with 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/challenges',
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects unauthenticated requests to GET /api/v1/admin/teams with 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/teams',
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects unauthenticated requests to GET /api/v1/admin/audit with 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/audit',
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. PARTICIPANT ROLE PRIVILEGE ISOLATION
  // ---------------------------------------------------------------------------
  describe('Participant Role Isolation', () => {
    it('rejects participant accessing GET /api/v1/admin/competition/state with 403', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/competition/state',
        headers: { authorization: `Bearer ${participantToken}` },
      });
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).message).toMatch(/Insufficient permissions|Forbidden/i);
    });

    it('rejects participant attempting POST /api/v1/admin/competition/pause with 403', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/competition/pause',
        headers: { authorization: `Bearer ${participantToken}` },
        payload: { reason: 'malicious attempt' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('rejects participant attempting GET /api/v1/admin/audit with 403', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/audit',
        headers: { authorization: `Bearer ${participantToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('rejects participant attempting POST /api/v1/admin/teams/some-id/adjust-score with 403', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/teams/t0000000-0000-0000-0000-000000000001/adjust-score',
        headers: { authorization: `Bearer ${participantToken}` },
        payload: { delta: 1000, reason: 'self reward' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. ADMIN ROLE PERMISSION BOUNDARIES
  // ---------------------------------------------------------------------------
  describe('Admin Role Boundaries', () => {
    it('allows admin to view competition state', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/competition/state',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect([200, 500]).toContain(res.statusCode); // Either 200 or 500 if DB mocked, but definitely not 401/403
      expect(res.statusCode).not.toBe(401);
      expect(res.statusCode).not.toBe(403);
    });

    it('allows admin to view audit logs', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/audit',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).not.toBe(401);
      expect(res.statusCode).not.toBe(403);
    });

    it('prohibits admin from executing superadmin-only role updates with 403', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/admin/users/p0000000-0000-0000-0000-000000000001/role',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { role: 'admin', reason: 'unauthorized privilege escalation' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. SUPERADMIN PERMISSIONS
  // ---------------------------------------------------------------------------
  describe('Superadmin Permissions', () => {
    it('allows superadmin to access role management endpoint (passes RBAC gate)', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/admin/users/00000000-0000-0000-0000-000000000000/role',
        headers: { authorization: `Bearer ${superadminToken}` },
        payload: { role: 'admin', reason: 'valid promotion' },
      });
      // Superadmin passes the RBAC gate; error if any is downstream domain/not found, NOT 403 forbidden
      expect(res.statusCode).not.toBe(403);
      expect(res.statusCode).not.toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. ADMIN PARTICIPATION BLOCKING
  // ---------------------------------------------------------------------------
  describe('Admin Participation Guard', () => {
    it('prohibits admin account from submitting flags through participant route', async () => {
      // Create admin token with a teamId attached to attempt submission
      const competingAdmin: AuthUser = {
        id: 'a0000000-0000-0000-0000-000000000002',
        username: 'cheating_admin',
        email: 'cheat@admin.org',
        role: 'admin',
        teamId: 't0000000-0000-0000-0000-000000000001',
        teamRole: 'member',
      };
      const token = app.jwt.sign(competingAdmin);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/submissions/flag',
        headers: { authorization: `Bearer ${token}` },
        payload: { challengeSlug: 'web-101', flag: 'TECHX{sample}' },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).message).toMatch(/Administrators cannot participate/i);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. CSRF PROTECTION FOR COOKIE AUTHENTICATION
  // ---------------------------------------------------------------------------
  describe('CSRF Protection on State Mutations', () => {
    it('blocks state-changing request authenticated via cookie if custom anti-CSRF header is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/competition/pause',
        cookies: { access_token: adminToken },
        payload: { reason: 'emergency pause without csrf header' },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).message).toMatch(/CSRF/i);
    });

    it('allows state-changing request authenticated via cookie when X-CTF-Admin header is present', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/competition/pause',
        cookies: { access_token: adminToken },
        headers: {
          'x-ctf-admin': '1',
        },
        payload: { reason: 'emergency pause with csrf header' },
      });

      // Passed CSRF check (may be 200 or downstream domain error, but NOT 403 CSRF)
      if (res.statusCode === 403) {
        expect(JSON.parse(res.body).message).not.toMatch(/CSRF verification failed/i);
      }
    });

    it('allows Bearer token requests without anti-CSRF header (Bearer token is non-browser / non-ambient)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/competition/pause',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: { reason: 'api call with bearer token' },
      });

      // Not blocked by CSRF
      if (res.statusCode === 403) {
        expect(JSON.parse(res.body).message).not.toMatch(/CSRF verification failed/i);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 7. AUDIT IMMUTABILITY (NO DELETE OR PUT ENDPOINTS)
  // ---------------------------------------------------------------------------
  describe('Audit Immutability', () => {
    it('returns 404 or 405 when attempting DELETE on /api/v1/admin/audit', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/admin/audit',
        headers: { authorization: `Bearer ${superadminToken}` },
      });

      expect([404, 405]).toContain(res.statusCode);
    });

    it('returns 404 or 405 when attempting PUT on /api/v1/admin/audit', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/admin/audit/123',
        headers: { authorization: `Bearer ${superadminToken}` },
        payload: { message: 'tampered' },
      });

      expect([404, 405]).toContain(res.statusCode);
    });
  });
});
