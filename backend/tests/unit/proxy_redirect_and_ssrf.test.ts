import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import * as http from 'http';
import { AddressInfo } from 'net';
import { buildApp } from '../../src/app.js';
import { dynamicChallengesService } from '../../src/modules/dynamic_challenges/dynamic_challenges.service.js';
import { competitionService } from '../../src/modules/competition/competition.service.js';

describe('Stage 8 Hardening: Proxy Redirect Safety & SSRF Parameter Defenses', () => {
  let app: FastifyInstance;
  let mockUpstreamServer: http.Server;
  let mockUpstreamPort: number;
  let participantToken: string;
  let lastUpstreamRequest: { method?: string; url?: string; headers?: http.IncomingHttpHeaders } = {};
  let upstreamResponseHandler: ((req: http.IncomingMessage, res: http.ServerResponse) => void) | null = null;

  beforeEach(async () => {
    vi.restoreAllMocks();
    upstreamResponseHandler = null;
    vi.spyOn(competitionService, 'requireLiveCompetition').mockResolvedValue(undefined);

    // Setup an ephemeral mock upstream HTTP server
    await new Promise<void>((resolve) => {
      mockUpstreamServer = http.createServer((req, res) => {
        lastUpstreamRequest = {
          method: req.method,
          url: req.url,
          headers: req.headers,
        };
        if (upstreamResponseHandler) {
          upstreamResponseHandler(req, res);
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', upstream: 'mock' }));
        }
      });
      mockUpstreamServer.listen(0, '127.0.0.1', () => {
        mockUpstreamPort = (mockUpstreamServer.address() as AddressInfo).port;
        resolve();
      });
    });

    app = await buildApp();
    await app.ready();

    participantToken = app.jwt.sign({
      id: 'u-participant-1',
      username: 'test_participant',
      role: 'participant',
      teamId: 't-team-1',
    });
  });

  afterEach(async () => {
    await app.close();
    await new Promise<void>((resolve) => mockUpstreamServer.close(() => resolve()));
  });

  // ---------------------------------------------------------------------------
  // 1. PROXY REDIRECT SAFETY (Requirement 6)
  // ---------------------------------------------------------------------------
  it.each([
    'http://127.0.0.1/',
    'http://localhost/',
    'http://169.254.169.254/',
    'http://10.0.0.1/',
    'http://172.16.0.1/',
    'http://192.168.1.1/',
    'http://[::1]/',
  ])('does NOT follow upstream redirects pointing to internal target: %s', async (forbiddenLocation) => {
    vi.spyOn(dynamicChallengesService, 'getProxyTarget').mockResolvedValue({
      internalIp: '127.0.0.1',
      internalPort: mockUpstreamPort,
    });

    upstreamResponseHandler = (_req, res) => {
      res.writeHead(302, {
        Location: forbiddenLocation,
        'X-Upstream-Header': 'techx-test',
      });
      res.end('Redirecting');
    };

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/challenges/intro-sqli-sandbox/instance/proxy/',
      headers: {
        authorization: `Bearer ${participantToken}`,
      },
    });

    // The proxy must directly pass through the 302 and Location header to the client
    // without initiating an internal second request to forbiddenLocation.
    expect(res.statusCode).toBe(302);
    expect(res.headers['location']).toBe(forbiddenLocation);
    expect(res.headers['x-upstream-header']).toBe('techx-test');
  });

  // ---------------------------------------------------------------------------
  // 2. PROXY TARGET VALIDATION & ZERO USER CONTROL (Requirement 7)
  // ---------------------------------------------------------------------------
  it('strictly ignores participant attempts to override upstream target via query parameters', async () => {
    vi.spyOn(dynamicChallengesService, 'getProxyTarget').mockResolvedValue({
      internalIp: '127.0.0.1',
      internalPort: mockUpstreamPort,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/challenges/intro-sqli-sandbox/instance/proxy/?target=http://169.254.169.254&host=evil.com&port=6379&url=http://127.0.0.1:5432&upstream=internal',
      headers: {
        authorization: `Bearer ${participantToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    // Request must have reached mockUpstreamServer, NOT evil.com or 169.254.169.254
    expect(lastUpstreamRequest.headers?.['host']).toBe(`127.0.0.1:${mockUpstreamPort}`);
  });

  it('strips client-supplied spoofing headers (Host, X-Target-Host, X-Upstream-Url)', async () => {
    vi.spyOn(dynamicChallengesService, 'getProxyTarget').mockResolvedValue({
      internalIp: '127.0.0.1',
      internalPort: mockUpstreamPort,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/challenges/intro-sqli-sandbox/instance/proxy/',
      headers: {
        authorization: `Bearer ${participantToken}`,
        host: 'malicious-metadata.internal',
        'x-target-host': '169.254.169.254',
        'x-upstream-url': 'http://postgres:5432',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(lastUpstreamRequest.headers?.['host']).toBe(`127.0.0.1:${mockUpstreamPort}`);
    expect(lastUpstreamRequest.headers?.['x-target-host']).toBeUndefined();
    expect(lastUpstreamRequest.headers?.['x-upstream-url']).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // 3. PROXY URL PARSING & CRLF INJECTION DEFENSE (Requirement 8)
  // ---------------------------------------------------------------------------
  it('rejects CRLF and null-byte injection attempts in request path', async () => {
    vi.spyOn(dynamicChallengesService, 'getProxyTarget').mockResolvedValue({
      internalIp: '127.0.0.1',
      internalPort: mockUpstreamPort,
    });

    const resCRLF = await app.inject({
      method: 'GET',
      url: '/api/v1/challenges/intro-sqli-sandbox/instance/proxy/index%0d%0aInjected-Header:%20evil',
      headers: {
        authorization: `Bearer ${participantToken}`,
      },
    });
    expect(resCRLF.statusCode).toBe(400);

    const resNullByte = await app.inject({
      method: 'GET',
      url: '/api/v1/challenges/intro-sqli-sandbox/instance/proxy/index%00evil',
      headers: {
        authorization: `Bearer ${participantToken}`,
      },
    });
    expect(resNullByte.statusCode).toBe(400);
  });

  it('fails safely with 500 when instance metadata in DB contains invalid IP format', async () => {
    vi.spyOn(dynamicChallengesService, 'getProxyTarget').mockResolvedValue({
      internalIp: 'internal-attacker.local', // Invalid non-IPv4 string
      internalPort: 8080,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/challenges/intro-sqli-sandbox/instance/proxy/',
      headers: {
        authorization: `Bearer ${participantToken}`,
      },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json().message).toContain('Invalid instance target configuration');
  });

  it('fails safely with 500 when instance metadata in DB contains invalid port', async () => {
    vi.spyOn(dynamicChallengesService, 'getProxyTarget').mockResolvedValue({
      internalIp: '127.0.0.1',
      internalPort: 99999, // Invalid port > 65535
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/challenges/intro-sqli-sandbox/instance/proxy/',
      headers: {
        authorization: `Bearer ${participantToken}`,
      },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json().message).toContain('Invalid instance target configuration');
  });
});
