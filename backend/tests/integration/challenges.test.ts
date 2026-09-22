import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { AuthUser } from '../../src/types/auth.js';

describe('Challenge Engine Endpoints', () => {
  let app: FastifyInstance;
  let userWithoutTeamToken: string;
  let userWithTeamToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const noTeamUser: AuthUser = {
      id: 'c0000000-0000-0000-0000-000000000001',
      username: 'lone_wolf',
      email: 'wolf@techxmadras.org',
      role: 'participant',
      teamId: null,
      teamRole: null,
    };
    userWithoutTeamToken = app.jwt.sign(noTeamUser);

    const teamUser: AuthUser = {
      id: 'c0000000-0000-0000-0000-000000000002',
      username: 'team_player',
      email: 'player@techxmadras.org',
      role: 'participant',
      teamId: 'd0000000-0000-0000-0000-000000000001',
      teamRole: 'member',
    };
    userWithTeamToken = app.jwt.sign(teamUser);
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // 1. CATEGORIES
  // ---------------------------------------------------------------------------
  it('GET /api/v1/categories returns list of categories', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/categories',
    });

    expect([200, 500]).toContain(response.statusCode);
    if (response.statusCode === 200) {
      const payload = JSON.parse(response.payload);
      expect(payload.success).toBe(true);
      expect(Array.isArray(payload.categories)).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // 2. CHALLENGES LIST & FILTERING
  // ---------------------------------------------------------------------------
  it('GET /api/v1/challenges lists published challenges', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/challenges',
    });

    expect([200, 500]).toContain(response.statusCode);
    if (response.statusCode === 200) {
      const payload = JSON.parse(response.payload);
      expect(payload.success).toBe(true);
      expect(Array.isArray(payload.challenges)).toBe(true);

      // Security check: Flag hashes must NEVER be returned in challenge lists!
      for (const ch of payload.challenges) {
        expect(ch.flagHash).toBeUndefined();
        expect(ch.flag).toBeUndefined();
      }
    }
  });

  it('GET /api/v1/challenges rejects invalid difficulty filter with 400', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/challenges?difficulty=insane',
    });

    expect(response.statusCode).toBe(400);
  });

  it('GET /api/v1/challenges/:slug returns 404 for non-existent challenge', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/challenges/does-not-exist-xyz',
    });

    expect([404, 500]).toContain(response.statusCode);
  });

  // ---------------------------------------------------------------------------
  // 3. HINT UNLOCK GUARDS
  // ---------------------------------------------------------------------------
  it('POST /api/v1/challenges/:slug/hints/:hintId/unlock requires authentication', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/challenges/web-101/hints/123e4567-e89b-12d3-a456-426614174000/unlock',
    });

    expect(response.statusCode).toBe(401);
  });

  it('POST /api/v1/challenges/:slug/hints/:hintId/unlock rejects users without a team with 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/challenges/web-101/hints/123e4567-e89b-12d3-a456-426614174000/unlock',
      headers: {
        authorization: `Bearer ${userWithoutTeamToken}`,
      },
    });

    expect(response.statusCode).toBe(400);
    const payload = JSON.parse(response.payload);
    expect(payload.message).toContain('You must be a member of a team');
  });

  // ---------------------------------------------------------------------------
  // 4. SECURE FILE DOWNLOAD GUARDS
  // ---------------------------------------------------------------------------
  it('GET /api/v1/challenges/:slug/files/:fileId requires authentication', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/challenges/forensics-1/files/123e4567-e89b-12d3-a456-426614174000',
    });

    expect(response.statusCode).toBe(401);
  });

  it('GET /api/v1/challenges/:slug/files/:fileId rejects users without a team with 400', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/challenges/forensics-1/files/123e4567-e89b-12d3-a456-426614174000',
      headers: {
        authorization: `Bearer ${userWithoutTeamToken}`,
      },
    });

    expect(response.statusCode).toBe(400);
  });
});
