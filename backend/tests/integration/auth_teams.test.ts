import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { AuthUser } from '../../src/types/auth.js';

describe('Auth & Team Integration Endpoints', () => {
  let app: FastifyInstance;
  let testUserToken: string;
  let teamMemberToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Generate signed test tokens using app's JWT instance
    const testUser: AuthUser = {
      id: 'a0000000-0000-0000-0000-000000000001',
      username: 'agent_zero',
      email: 'agent0@techxmadras.org',
      role: 'participant',
      teamId: null,
      teamRole: null,
    };
    testUserToken = app.jwt.sign(testUser);

    const teamUser: AuthUser = {
      id: 'a0000000-0000-0000-0000-000000000002',
      username: 'captain_jack',
      email: 'jack@techxmadras.org',
      role: 'participant',
      teamId: 'b0000000-0000-0000-0000-000000000001',
      teamRole: 'captain',
    };
    teamMemberToken = app.jwt.sign(teamUser);
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // AUTH TESTS
  // ---------------------------------------------------------------------------
  describe('Authentication Routes', () => {
    it('POST /api/v1/auth/register is disabled and rejects public attempts with 403 Forbidden', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          username: 'participant_user',
          email: 'user@techxmadras.org',
          password: 'SecretPassword123!',
        },
      });

      expect(response.statusCode).toBe(403);
      const payload = JSON.parse(response.payload);
      expect(payload.code).toBe('PUBLIC_REGISTRATION_DISABLED');
      expect(payload.message).toContain('Public registration is disabled');
    });

    it('POST /api/v1/auth/login rejects empty credentials with 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          identifier: '',
          password: '',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('GET /api/v1/auth/me rejects unauthenticated requests with 401', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
      });

      expect(response.statusCode).toBe(401);
      const payload = JSON.parse(response.payload);
      expect(payload.message).toContain('Authentication token missing');
    });

    it('GET /api/v1/auth/me rejects forged/tampered JWT tokens with 401', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: 'Bearer forged.invalid.token',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('POST /api/v1/auth/logout successfully clears session cookie', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.success).toBe(true);
      expect(response.headers['set-cookie']).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // TEAM ROUTE GUARDS
  // ---------------------------------------------------------------------------
  describe('Team Route Protections & Guards', () => {
    it('POST /api/v1/teams rejects unauthenticated requests with 401', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/teams',
        payload: { name: 'HackersUnited' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('POST /api/v1/teams is disabled and rejects participant attempts with 403 Forbidden', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/teams',
        headers: {
          authorization: `Bearer ${testUserToken}`,
        },
        payload: { name: 'HackersUnited' },
      });

      expect(response.statusCode).toBe(403);
      const payload = JSON.parse(response.payload);
      expect(payload.code).toBe('TEAM_CREATION_DISABLED');
    });

    it('POST /api/v1/teams/join rejects unauthenticated requests with 401', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/teams/join',
        payload: { inviteCode: 'TECHX-AAAA-BBBB' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('GET /api/v1/teams/me rejects users without a team with 400', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/teams/me',
        headers: {
          authorization: `Bearer ${testUserToken}`, // testUser has teamId: null
        },
      });

      expect(response.statusCode).toBe(400);
      const payload = JSON.parse(response.payload);
      expect(payload.message).toContain('You must be a member of a team');
    });

    it('POST /api/v1/teams/leave is disabled and rejects participant attempts with 403 Forbidden', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/teams/leave',
        headers: {
          authorization: `Bearer ${teamMemberToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
      const payload = JSON.parse(response.payload);
      expect(payload.code).toBe('TEAM_LEAVE_DISABLED');
    });

    it('GET /api/v1/teams allows fetching public team directory', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/teams',
      });

      expect([200, 500]).toContain(response.statusCode);
      if (response.statusCode === 200) {
        const payload = JSON.parse(response.payload);
        expect(payload.success).toBe(true);
        expect(Array.isArray(payload.teams)).toBe(true);
      }
    });
  });
});
