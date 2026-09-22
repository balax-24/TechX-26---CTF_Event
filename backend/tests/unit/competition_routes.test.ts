import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';

describe('Public Competition State Route', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows unauthenticated participant access to GET /api/v1/competition/state', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/competition/state',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.competition).toBeDefined();
    expect(body.competition.name).toBe('TechX CTF 2026');
    expect(typeof body.competition.state).toBe('string');
    expect(typeof body.competition.isSubmissionEnabled).toBe('boolean');
    expect(body.competition.timezone).toBe('Asia/Kolkata');
  });
});
