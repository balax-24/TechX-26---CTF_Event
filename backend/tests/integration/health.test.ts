import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';

describe('Health and System Status Probes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns 200 OK with uptime and status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const payload = JSON.parse(response.payload);
    expect(payload.status).toBe('ok');
    expect(payload.uptimeSeconds).toBeTypeOf('number');
    expect(payload.timestamp).toBeDefined();
  });

  it('GET /api/v1 returns API root metadata', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1',
    });

    expect(response.statusCode).toBe(200);
    const payload = JSON.parse(response.payload);
    expect(payload.name).toBe('TechX CTF Core API');
    expect(payload.event).toBe('TechX Madras 2026');
    expect(payload.status).toBe('operational');
  });

  it('GET /api/v1/health responds with service checks', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    // When running in isolated test without live Postgres/Redis, it may return 200 (if services are mocked/alive) or 503 (if services down)
    expect([200, 503]).toContain(response.statusCode);
    const payload = JSON.parse(response.payload);
    expect(payload.services).toBeDefined();
    expect(payload.services.database).toBeDefined();
    expect(payload.services.redis).toBeDefined();
    expect(payload.deploymentMode).toBeDefined();
  });
});
