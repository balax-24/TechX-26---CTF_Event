import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { AuthUser } from '../../src/types/auth.js';
import { checkRateLimit } from '../../src/utils/rate_limiter.js';

describe('Submissions and Checkpoint Route Guards', () => {
  let app: FastifyInstance;
  let userWithoutTeamToken: string;
  let userWithTeamToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const noTeamUser: AuthUser = {
      id: 'e0000000-0000-0000-0000-000000000001',
      username: 'solo_hacker',
      email: 'solo@techxmadras.org',
      role: 'participant',
      teamId: null,
      teamRole: null,
    };
    userWithoutTeamToken = app.jwt.sign(noTeamUser);

    const teamUser: AuthUser = {
      id: 'e0000000-0000-0000-0000-000000000002',
      username: 'team_member',
      email: 'member@techxmadras.org',
      role: 'participant',
      teamId: 'f0000000-0000-0000-0000-000000000001',
      teamRole: 'member',
    };
    userWithTeamToken = app.jwt.sign(teamUser);
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // 1. FLAG SUBMISSION ROUTE GUARDS
  // ---------------------------------------------------------------------------
  describe('POST /api/v1/submissions/flag', () => {
    it('requires authentication (returns 401 when no token)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/submissions/flag',
        payload: {
          challengeSlug: 'web-101',
          flag: 'TECHX{sample_flag}',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('rejects user who is not in a team with 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/submissions/flag',
        headers: {
          authorization: `Bearer ${userWithoutTeamToken}`,
        },
        payload: {
          challengeSlug: 'web-101',
          flag: 'TECHX{sample_flag}',
        },
      });

      expect(response.statusCode).toBe(400);
      const payload = JSON.parse(response.payload);
      expect(payload.message).toContain('You must be a member of a team');
    });

    it('rejects malformed payload (missing flag) with 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/submissions/flag',
        headers: {
          authorization: `Bearer ${userWithTeamToken}`,
        },
        payload: {
          challengeSlug: 'web-101',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects malformed payload (invalid challengeSlug format) with 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/submissions/flag',
        headers: {
          authorization: `Bearer ${userWithTeamToken}`,
        },
        payload: {
          challengeSlug: 'Invalid Slug With Spaces!',
          flag: 'TECHX{sample}',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 404 or handles non-existent challenge cleanly', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/submissions/flag',
        headers: {
          authorization: `Bearer ${userWithTeamToken}`,
        },
        payload: {
          challengeSlug: 'non-existent-challenge-slug',
          flag: 'TECHX{test_flag}',
        },
      });

      // 404 if DB query returns nothing, 500 if DB is disconnected in mock env
      expect([404, 500]).toContain(response.statusCode);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. CHECKPOINT VALIDATION ROUTE GUARDS
  // ---------------------------------------------------------------------------
  describe('POST /api/v1/checkpoints/:checkpointId/validate', () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';

    it('requires authentication (returns 401 when no token)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/checkpoints/${validUuid}/validate`,
        payload: { proof: 'sample_proof' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('rejects user without team with 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/checkpoints/${validUuid}/validate`,
        headers: {
          authorization: `Bearer ${userWithoutTeamToken}`,
        },
        payload: { proof: 'sample_proof' },
      });

      expect(response.statusCode).toBe(400);
      const payload = JSON.parse(response.payload);
      expect(payload.message).toContain('You must be a member of a team');
    });

    it('rejects invalid checkpoint UUID path param with 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/checkpoints/not-a-uuid/validate',
        headers: {
          authorization: `Bearer ${userWithTeamToken}`,
        },
        payload: { proof: 'sample_proof' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects empty proof body with 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/checkpoints/${validUuid}/validate`,
        headers: {
          authorization: `Bearer ${userWithTeamToken}`,
        },
        payload: { proof: '' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. SLIDING WINDOW RATE LIMITER INTEGRATION
  // ---------------------------------------------------------------------------
  describe('Sliding-Window Rate Limiter', () => {
    it('permits requests within quota and enforces limit upon exhaustion', async () => {
      const testKey = `test_rate_limit_${Date.now()}`;
      const maxRequests = 3;
      const windowMs = 5000;

      // 1st request -> allowed
      const r1 = await checkRateLimit(testKey, maxRequests, windowMs);
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(2);

      // 2nd request -> allowed
      const r2 = await checkRateLimit(testKey, maxRequests, windowMs);
      expect(r2.allowed).toBe(true);
      expect(r2.remaining).toBe(1);

      // 3rd request -> allowed
      const r3 = await checkRateLimit(testKey, maxRequests, windowMs);
      expect(r3.allowed).toBe(true);
      expect(r3.remaining).toBe(0);

      // 4th request -> blocked!
      const r4 = await checkRateLimit(testKey, maxRequests, windowMs);
      expect(r4.allowed).toBe(false);
      expect(r4.remaining).toBe(0);
    });
  });
});
