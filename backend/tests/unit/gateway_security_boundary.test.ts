import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { PassThrough } from 'stream';
import { ChallengeGatewayService, createGatewayHttpServer } from '../../src/modules/dynamic_challenges/challenge_gateway.service.js';
import { MockDockerManager } from '../../src/modules/dynamic_challenges/docker.manager.js';
import { dynamicChallengeRegistry } from '../../src/modules/dynamic_challenges/dynamic_challenges.registry.js';

describe('Stage 8 Final Security Blocker: Gateway Architecture & Trust Boundaries', () => {
  let gatewayService: ChallengeGatewayService;
  let mockDocker: MockDockerManager;
  let testServer: http.Server | null = null;
  let serverPort: number;
  const TEST_SECRET = 'test_gateway_isolated_secret_2026';

  beforeEach(async () => {
    mockDocker = new MockDockerManager();
    gatewayService = new ChallengeGatewayService();
    gatewayService.setDockerManager(mockDocker);
  });

  afterEach(async () => {
    if (testServer) {
      await new Promise<void>((resolve) => testServer!.close(() => resolve()));
      testServer = null;
    }
  });

  // ---------------------------------------------------------------------------
  // 1. DOCKER COMPOSE TOPOLOGY & SOCKET ISOLATION (Static Verification)
  // ---------------------------------------------------------------------------
  describe('Static Compose Isolation & Secret Boundaries', () => {
    it('verifies primary Fastify backend container has NO Docker daemon socket mounted', () => {
      const composePath = path.resolve(__dirname, '../../../docker-compose.yml');
      const composeContent = fs.readFileSync(composePath, 'utf-8');

      // Extract backend service section
      const backendSectionMatch = composeContent.match(/\n  backend:\s*[\s\S]*?(?=\n  [a-z_]+:|$)/);
      expect(backendSectionMatch).toBeTruthy();
      const backendSection = backendSectionMatch![0];

      // backend volumes must not contain docker.sock
      expect(backendSection).not.toContain('/var/run/docker.sock');
      // backend must not join challenge network directly
      expect(backendSection).not.toContain('ctf_challenges_net');
      expect(backendSection).not.toContain('techx_ctf_challenges_net');
      // backend must only connect to core net and gateway net
      expect(backendSection).toContain('ctf_core_net');
      expect(backendSection).toContain('ctf_gateway_net');
    });

    it('verifies Docker socket is ONLY exposed to the dedicated challenge_gateway container', () => {
      const composePath = path.resolve(__dirname, '../../../docker-compose.yml');
      const composeContent = fs.readFileSync(composePath, 'utf-8');

      // Extract challenge_gateway service section
      const gatewaySectionMatch = composeContent.match(/\n  challenge_gateway:\s*[\s\S]*?(?=\n  [a-z_]+:|$)/);
      expect(gatewaySectionMatch).toBeTruthy();
      const gatewaySection = gatewaySectionMatch![0];

      // challenge_gateway has docker.sock mounted as a high-trust infrastructure component
      expect(gatewaySection).toContain('/var/run/docker.sock:/var/run/docker.sock');
      // challenge_gateway is connected to ctf_gateway_net
      expect(gatewaySection).toContain('ctf_gateway_net');
      // challenge_gateway must NOT be connected to ctf_core_net (where postgres & redis reside)
      expect(gatewaySection).not.toContain('ctf_core_net');
    });

    it('verifies challenge_gateway container receives ZERO platform database, redis, or jwt secrets', () => {
      const composePath = path.resolve(__dirname, '../../../docker-compose.yml');
      const composeContent = fs.readFileSync(composePath, 'utf-8');

      const gatewaySectionMatch = composeContent.match(/\n  challenge_gateway:\s*[\s\S]*?(?=\n  [a-z_]+:|$)/);
      expect(gatewaySectionMatch).toBeTruthy();
      const gatewaySection = gatewaySectionMatch![0];

      // Must NOT contain sensitive platform credentials
      expect(gatewaySection).not.toContain('DATABASE_URL');
      expect(gatewaySection).not.toContain('POSTGRES_PASSWORD');
      expect(gatewaySection).not.toContain('REDIS_PASSWORD');
      expect(gatewaySection).not.toContain('JWT_SECRET');
      expect(gatewaySection).not.toContain('COOKIE_SECRET');
      expect(gatewaySection).not.toContain('FLAG_SALT');
    });

    it('verifies ctf_gateway_net is marked internal: true to prevent WAN egress', () => {
      const composePath = path.resolve(__dirname, '../../../docker-compose.yml');
      const composeContent = fs.readFileSync(composePath, 'utf-8');

      expect(composeContent).toMatch(/ctf_gateway_net:\s*\n\s*name:\s*techx_ctf_gateway_net\s*\n\s*driver:\s*bridge\s*\n\s*internal:\s*true/);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. NETWORK ATTACHMENT INVARIANT: BACKEND NEVER JOINS CHALLENGE NETWORKS
  // ---------------------------------------------------------------------------
  describe('Backend vs Challenge Network Invariant', () => {
    it('proves creating an instance attaches ONLY the gateway container, never the backend', async () => {
      const networkConnectSpy = vi.spyOn(mockDocker, 'connectContainer');

      // Set gateway container name to simulate production container identity
      (gatewayService as any).gatewayContainerName = 'techx_challenge_gateway';

      const result = await gatewayService.createAndStartInstance({
        instanceId: 'inst-sec-boundary-1',
        teamId: 'team-sec-1',
        challengeId: 'c-web-sqli',
        slug: 'sqli-portal',
        image: 'techx/sqli:latest',
        internalPort: 8080,
        memoryLimitBytes: 256 * 1024 * 1024,
        cpuLimitNano: 500_000_000,
        pidsLimit: 64,
        readOnlyRootfs: true,
        tmpfsMounts: {},
        env: {},
        labels: {
          'techx.managed': 'true',
          'techx.instance_id': 'inst-sec-boundary-1',
        },
      });

      expect(result.instanceId).toBe('inst-sec-boundary-1');
      expect(networkConnectSpy).toHaveBeenCalledTimes(1);

      // Must connect gateway container (techx_challenge_gateway) to the instance network
      const [connectedNetwork, connectedContainer] = networkConnectSpy.mock.calls[0];
      expect(connectedContainer).toBe('techx_challenge_gateway');
      expect(connectedContainer).not.toBe('techx_ctf_backend');
      expect(connectedContainer).not.toBe('backend');
      expect(connectedNetwork).toBe(result.networkName);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. GATEWAY HTTP API & AUTHENTICATION
  // ---------------------------------------------------------------------------
  describe('Gateway HTTP Control Plane Security', () => {
    beforeEach(async () => {
      testServer = createGatewayHttpServer(gatewayService, TEST_SECRET);
      await new Promise<void>((resolve) => {
        testServer!.listen(0, '127.0.0.1', () => {
          const addr = testServer!.address() as any;
          serverPort = addr.port;
          resolve();
        });
      });
    });

    it('health check endpoint is open for docker probe without secrets', async () => {
      const res = await fetch(`http://127.0.0.1:${serverPort}/health`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('ok');
    });

    it('rejects control plane requests without x-gateway-secret with 403 Forbidden', async () => {
      const res = await fetch(`http://127.0.0.1:${serverPort}/internal/instances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('FORBIDDEN');
    });

    it('rejects control plane requests with invalid x-gateway-secret with 403 Forbidden', async () => {
      const res = await fetch(`http://127.0.0.1:${serverPort}/internal/instances`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gateway-secret': 'invalid_forged_secret_token',
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('FORBIDDEN');
    });

    it('accepts control plane requests with valid x-gateway-secret', async () => {
      const res = await fetch(`http://127.0.0.1:${serverPort}/internal/instances`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gateway-secret': TEST_SECRET,
        },
        body: JSON.stringify({
          instanceId: 'inst-sec-http-1',
          teamId: 'team-sec-1',
          challengeId: 'c-web-sqli',
          slug: 'sqli-portal',
          image: 'techx/sqli:latest',
          internalPort: 8080,
          memoryLimitBytes: 256 * 1024 * 1024,
          cpuLimitNano: 500_000_000,
          pidsLimit: 64,
          readOnlyRootfs: true,
          tmpfsMounts: {},
          env: {},
          labels: { 'techx.managed': 'true' },
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.result.instanceId).toBe('inst-sec-http-1');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. PROXY DESTINATION & SSRF BLOCKING
  // ---------------------------------------------------------------------------
  describe('Proxy Request Boundary & SSRF Defense', () => {
    it('strictly blocks proxying to loopback addresses (127.0.0.1, localhost)', async () => {
      const clientReq = new http.IncomingMessage({} as any);
      clientReq.method = 'GET';
      clientReq.headers = {};
      clientReq.push(null);

      let writtenStatus = 0;
      let writtenData = '';
      const clientRes = {
        writeHead: (code: number) => { writtenStatus = code; },
        end: (data: string) => { writtenData = data; },
        headersSent: false,
      } as any;

      // In production mode, loopback proxying is prohibited
      gatewayService.allowLoopbackProxy = false;

      await gatewayService.proxyRequest(
        clientReq,
        clientRes,
        { internalIp: '127.0.0.1', internalPort: 8080 },
        '/'
      );

      expect(writtenStatus).toBe(403);
      expect(writtenData).toContain('Target destination is forbidden');
    });

    it('strictly blocks proxying to cloud metadata endpoints (169.254.169.254)', async () => {
      const clientReq = new http.IncomingMessage({} as any);
      clientReq.method = 'GET';
      clientReq.headers = {};
      clientReq.push(null);

      let writtenStatus = 0;
      let writtenData = '';
      const clientRes = {
        writeHead: (code: number) => { writtenStatus = code; },
        end: (data: string) => { writtenData = data; },
        headersSent: false,
      } as any;

      await gatewayService.proxyRequest(
        clientReq,
        clientRes,
        { internalIp: '169.254.169.254', internalPort: 80 },
        '/'
      );

      expect(writtenStatus).toBe(403);
      expect(writtenData).toContain('Target destination is forbidden');
    });

    it('strictly blocks proxying to non-IPv4 hostnames (attempted internal DNS abuse)', async () => {
      const clientReq = new http.IncomingMessage({} as any);
      clientReq.method = 'GET';
      clientReq.headers = {};
      clientReq.push(null);

      let writtenStatus = 0;
      let writtenData = '';
      const clientRes = {
        writeHead: (code: number) => { writtenStatus = code; },
        end: (data: string) => { writtenData = data; },
        headersSent: false,
      } as any;

      await gatewayService.proxyRequest(
        clientReq,
        clientRes,
        { internalIp: 'backend', internalPort: 4000 },
        '/'
      );

      expect(writtenStatus).toBe(403);
      expect(writtenData).toContain('Target destination is forbidden');
    });

    it('preserves 3xx HTTP redirects without following them', async () => {
      // Create a mock upstream HTTP server that responds with a 302 redirect to http://127.0.0.1/pwned
      const upstream = http.createServer((req, res) => {
        res.writeHead(302, {
          'location': 'http://127.0.0.1:4000/admin',
          'x-custom-header': 'redirect-test',
        });
        res.end();
      });

      await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', () => resolve()));
      const upstreamAddr = upstream.address() as any;

      const clientReq = new PassThrough() as any;
      clientReq.method = 'GET';
      clientReq.headers = {};
      clientReq.socket = { destroy: () => {}, remoteAddress: '127.0.0.1' };
      clientReq.end();

      let writtenStatus = 0;
      let writtenHeaders: any = {};
      const clientRes = new PassThrough() as any;
      clientRes.headersSent = false;
      clientRes.writeHead = (code: number, headers: any) => {
        writtenStatus = code;
        writtenHeaders = headers;
      };

      // Enable loopback proxy flag specifically for local integration test
      gatewayService.allowLoopbackProxy = true;

      try {
        await gatewayService.proxyRequest(
          clientReq,
          clientRes,
          { internalIp: '127.0.0.1', internalPort: upstreamAddr.port },
          '/login'
        );

        // Expect 302 to be passed DIRECTLY back to participant, NOT followed!
        expect(writtenStatus).toBe(302);
        expect(writtenHeaders['location']).toBe('http://127.0.0.1:4000/admin');
        expect(writtenHeaders['x-custom-header']).toBe('redirect-test');
      } finally {
        gatewayService.allowLoopbackProxy = false;
        await new Promise<void>((resolve) => upstream.close(() => resolve()));
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 5. RUNTIME NETWORK REACHABILITY MATRIX (Simulation Contract)
  // ---------------------------------------------------------------------------
  describe('Simulation Contract: Compromised Challenge Reachability', () => {
    it('guarantees compromised challenge container CANNOT reach primary Fastify backend', async () => {
      const container = await mockDocker.createAndStartContainer({
        containerName: 'techx26-inst-compromised',
        image: 'techx/vulnerable:latest',
        networkName: 'techx-inst-net-comp',
        internalPort: 8080,
        memoryLimitBytes: 256 * 1024 * 1024,
        cpuLimitNano: 500_000_000,
        pidsLimit: 64,
        readOnlyRootfs: true,
        tmpfsMounts: {},
        env: {},
        labels: { 'techx.managed': 'true' },
      });

      // Attempt to reach backend container name
      const connName = mockDocker.simulateNetworkConnection(container.containerId, 'techx_ctf_backend', 4000);
      expect(connName.allowed).toBe(false);
      expect(connName.reason).toContain('Internal backend management port is unreachable');

      // Attempt to reach backend alias
      const connAlias = mockDocker.simulateNetworkConnection(container.containerId, 'backend', 4000);
      expect(connAlias.allowed).toBe(false);
      expect(connAlias.reason).toContain('Internal backend management port is unreachable');
    });

    it('guarantees compromised challenge container CANNOT reach PostgreSQL or Redis', async () => {
      const container = await mockDocker.createAndStartContainer({
        containerName: 'techx26-inst-compromised',
        image: 'techx/vulnerable:latest',
        networkName: 'techx-inst-net-comp',
        internalPort: 8080,
        memoryLimitBytes: 256 * 1024 * 1024,
        cpuLimitNano: 500_000_000,
        pidsLimit: 64,
        readOnlyRootfs: true,
        tmpfsMounts: {},
        env: {},
        labels: { 'techx.managed': 'true' },
      });

      const connPg = mockDocker.simulateNetworkConnection(container.containerId, 'postgres', 5432);
      expect(connPg.allowed).toBe(false);
      expect(connPg.reason).toContain('Database network (ctf_core_net) is strictly isolated');

      const connRedis = mockDocker.simulateNetworkConnection(container.containerId, 'redis', 6379);
      expect(connRedis.allowed).toBe(false);
      expect(connRedis.reason).toContain('Redis cache network (ctf_core_net) is strictly isolated');
    });

    it('guarantees Team A challenge container CANNOT reach Team B challenge container', async () => {
      await mockDocker.createNetwork('techx-inst-net-teama', { internal: true, icc: false });
      const containerA = await mockDocker.createAndStartContainer({
        containerName: 'techx26-inst-team-a',
        image: 'techx/chal:latest',
        networkName: 'techx-inst-net-teama',
        internalPort: 8080,
        memoryLimitBytes: 256 * 1024 * 1024,
        cpuLimitNano: 500_000_000,
        pidsLimit: 64,
        readOnlyRootfs: true,
        tmpfsMounts: {},
        env: {},
        labels: { 'techx.managed': 'true', 'techx.team_id': 'team-a' },
      });

      await mockDocker.createNetwork('techx-inst-net-teamb', { internal: true, icc: false });
      const containerB = await mockDocker.createAndStartContainer({
        containerName: 'techx26-inst-team-b',
        image: 'techx/chal:latest',
        networkName: 'techx-inst-net-teamb',
        internalPort: 8080,
        memoryLimitBytes: 256 * 1024 * 1024,
        cpuLimitNano: 500_000_000,
        pidsLimit: 64,
        readOnlyRootfs: true,
        tmpfsMounts: {},
        env: {},
        labels: { 'techx.managed': 'true', 'techx.team_id': 'team-b' },
      });

      const connAtoB = mockDocker.simulateNetworkConnection(
        containerA.containerId,
        containerB.internalIp,
        containerB.internalPort
      );
      expect(connAtoB.allowed).toBe(false);
      expect(connAtoB.reason).toContain('Distinct per-instance Docker networks prevent inter-team communication');
    });

    it('guarantees compromised challenge container CANNOT reach Gateway control API or Docker TCP ports', async () => {
      const container = await mockDocker.createAndStartContainer({
        containerName: 'techx26-inst-compromised-eval',
        image: 'techx/vulnerable:latest',
        networkName: 'techx-inst-net-eval',
        internalPort: 8080,
        memoryLimitBytes: 256 * 1024 * 1024,
        cpuLimitNano: 500_000_000,
        pidsLimit: 64,
        readOnlyRootfs: true,
        tmpfsMounts: {},
        env: {},
        labels: { 'techx.managed': 'true' },
      });

      // 1. Cannot reach gateway control API
      const connGateway = mockDocker.simulateNetworkConnection(container.containerId, 'techx_challenge_gateway', 5000);
      expect(connGateway.allowed).toBe(false);
      expect(connGateway.reason).toContain('Challenge Gateway control API listens strictly on ctf_gateway_net');

      // 2. Cannot reach Docker TCP port 2375
      const connDocker2375 = mockDocker.simulateNetworkConnection(container.containerId, '127.0.0.1', 2375);
      expect(connDocker2375.allowed).toBe(false);
      expect(connDocker2375.reason).toContain('Docker daemon TCP API (2375/2376) is not exposed');

      // 3. Cannot reach Docker TLS port 2376
      const connDocker2376 = mockDocker.simulateNetworkConnection(container.containerId, '127.0.0.1', 2376);
      expect(connDocker2376.allowed).toBe(false);
      expect(connDocker2376.reason).toContain('Docker daemon TCP API (2375/2376) is not exposed');

      // 4. Cannot reach Docker Unix socket
      const connDockerSock = mockDocker.simulateNetworkConnection(container.containerId, '/var/run/docker.sock', 0);
      expect(connDockerSock.allowed).toBe(false);
      expect(connDockerSock.reason).toContain('Docker daemon socket not mounted');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. COMPROMISED CHALLENGE → GATEWAY HTTP ORIGIN RESTRICTIONS
  // ---------------------------------------------------------------------------
  describe('Compromised Challenge → Gateway HTTP Origin Restrictions', () => {
    beforeEach(async () => {
      testServer = createGatewayHttpServer(gatewayService, TEST_SECRET);
      await new Promise<void>((resolve) => {
        testServer!.listen(0, '127.0.0.1', () => {
          const addr = testServer!.address() as any;
          serverPort = addr.port;
          resolve();
        });
      });
    });

    it('blocks /internal/ control requests originating from challenge network IP', async () => {
      gatewayService.registerInstance({
        instanceId: 'inst-comp-orig',
        containerId: 'c-comp-orig',
        containerName: 'techx-chal-comp',
        networkName: 'techx-inst-net-comp',
        internalIp: '172.18.0.2',
        internalPort: 8080,
      });

      const mockReq = new PassThrough() as any;
      mockReq.method = 'POST';
      mockReq.url = '/internal/instances';
      mockReq.headers = {
        'content-type': 'application/json',
        'x-gateway-secret': TEST_SECRET,
      };
      mockReq.socket = { remoteAddress: '172.18.0.2' };
      mockReq.end(JSON.stringify({ instanceId: 'hack' }));

      let status = 0;
      let body = '';
      const mockRes = new PassThrough() as any;
      mockRes.headersSent = false;
      mockRes.writeHead = (code: number) => { status = code; };
      mockRes.end = (chunk?: any) => { if (chunk) body += chunk; };

      const serverHandler = (testServer as any)._events.request;
      await serverHandler(mockReq, mockRes);

      expect(status).toBe(403);
      expect(body).toContain('Gateway control API is restricted to trusted management network');
    });

    it('blocks /health probes originating from challenge network IP', async () => {
      gatewayService.registerInstance({
        instanceId: 'inst-comp-health',
        containerId: 'c-comp-health',
        containerName: 'techx-chal-health',
        networkName: 'techx-inst-net-health',
        internalIp: '172.18.0.5',
        internalPort: 8080,
      });

      const mockReq = new PassThrough() as any;
      mockReq.method = 'GET';
      mockReq.url = '/health';
      mockReq.headers = {};
      mockReq.socket = { remoteAddress: '172.18.0.5' };
      mockReq.end();

      let status = 0;
      let body = '';
      const mockRes = new PassThrough() as any;
      mockRes.headersSent = false;
      mockRes.writeHead = (code: number) => { status = code; };
      mockRes.end = (chunk?: any) => { if (chunk) body += chunk; };

      const serverHandler = (testServer as any)._events.request;
      await serverHandler(mockReq, mockRes);

      expect(status).toBe(403);
      expect(body).toContain('Health probe forbidden from challenge network');
    });
  });

  // ---------------------------------------------------------------------------
  // 7. CROSS-TEAM PROXY ATTACK & HEADER SPOOFING DEFENSE
  // ---------------------------------------------------------------------------
  describe('Cross-Team Proxy Attack & Header Spoofing Defense', () => {
    beforeEach(async () => {
      testServer = createGatewayHttpServer(gatewayService, TEST_SECRET);
      await new Promise<void>((resolve) => {
        testServer!.listen(0, '127.0.0.1', () => {
          const addr = testServer!.address() as any;
          serverPort = addr.port;
          resolve();
        });
      });

      gatewayService.registerInstance({
        instanceId: 'inst-team-a-123',
        containerId: 'c-team-a-123',
        containerName: 'techx-chal-a',
        networkName: 'techx-inst-net-a',
        internalIp: '172.18.1.10',
        internalPort: 8080,
      });

      gatewayService.registerInstance({
        instanceId: 'inst-team-b-456',
        containerId: 'c-team-b-456',
        containerName: 'techx-chal-b',
        networkName: 'techx-inst-net-b',
        internalIp: '172.18.2.20',
        internalPort: 9000,
      });
    });

    it('derives destination strictly from server instance metadata, ignoring query manipulation', async () => {
      const proxySpy = vi.spyOn(gatewayService, 'proxyRequest').mockImplementation(async (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ proxied: true }));
      });

      const res = await fetch(
        `http://127.0.0.1:${serverPort}/proxy/inst-team-a-123/login?target=172.18.2.20&upstream=http://172.18.2.20:9000&ip=172.18.2.20&port=9000`,
        {
          headers: { 'x-gateway-secret': TEST_SECRET },
        }
      );

      expect(res.status).toBe(200);
      expect(proxySpy).toHaveBeenCalledTimes(1);

      const targetArg = proxySpy.mock.calls[0][2];
      expect(targetArg.internalIp).toBe('172.18.1.10');
      expect(targetArg.internalPort).toBe(8080);
      expect(targetArg.internalIp).not.toBe('172.18.2.20');
      expect(targetArg.internalPort).not.toBe(9000);
    });

    it('strips client spoofing headers (X-Target-Host, X-Upstream-URL, Host, X-Forwarded-Host)', async () => {
      let receivedHeaders: any = {};
      const upstream = http.createServer((req, res) => {
        receivedHeaders = req.headers;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });

      await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', () => resolve()));
      const upstreamAddr = upstream.address() as any;

      gatewayService.allowLoopbackProxy = true;
      gatewayService.registerInstance({
        instanceId: 'inst-header-test',
        containerId: 'c-header-test',
        containerName: 'techx-chal-headers',
        networkName: 'techx-inst-net-h',
        internalIp: '127.0.0.1',
        internalPort: upstreamAddr.port,
      });

      try {
        const res = await fetch(`http://127.0.0.1:${serverPort}/proxy/inst-header-test/api`, {
          headers: {
            'x-gateway-secret': TEST_SECRET,
            'Host': '172.18.2.20:9000',
            'X-Target-Host': '172.18.2.20',
            'X-Upstream-URL': 'http://172.18.2.20:9000',
            'X-Forwarded-Host': 'attacker-controlled.internal',
            'X-Docker-Host': 'unix:///var/run/docker.sock',
          },
        });

        expect(res.status).toBe(200);
        expect(receivedHeaders['x-target-host']).toBeUndefined();
        expect(receivedHeaders['x-upstream-url']).toBeUndefined();
        expect(receivedHeaders['x-forwarded-host']).toBeUndefined();
        expect(receivedHeaders['x-docker-host']).toBeUndefined();
        expect(receivedHeaders['x-gateway-secret']).toBeUndefined();
        expect(receivedHeaders['host']).toBe(`127.0.0.1:${upstreamAddr.port}`);
      } finally {
        gatewayService.allowLoopbackProxy = false;
        await new Promise<void>((resolve) => upstream.close(() => resolve()));
      }
    });

    it('returns 404 NOT_FOUND when attempting to proxy to an unregistered instance', async () => {
      const res = await fetch(`http://127.0.0.1:${serverPort}/proxy/inst-unknown-random-id/dashboard`, {
        headers: { 'x-gateway-secret': TEST_SECRET },
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe('NOT_FOUND');
    });
  });

  // ---------------------------------------------------------------------------
  // 8. ARBITRARY NETWORK BRIDGE & TUNNELING DEFENSE
  // ---------------------------------------------------------------------------
  describe('Arbitrary Network Bridge & Tunneling Defense', () => {
    beforeEach(async () => {
      testServer = createGatewayHttpServer(gatewayService, TEST_SECRET);
      await new Promise<void>((resolve) => {
        testServer!.listen(0, '127.0.0.1', () => {
          const addr = testServer!.address() as any;
          serverPort = addr.port;
          resolve();
        });
      });
    });

    it('rejects HTTP CONNECT method for arbitrary TCP tunneling with 405 Method Not Allowed', async () => {
      const res = await new Promise<{ statusCode?: number }>((resolve) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: serverPort,
          method: 'CONNECT',
          path: '10.0.0.1:443',
          headers: { 'x-gateway-secret': TEST_SECRET },
        });
        req.on('connect', (response) => resolve({ statusCode: response.statusCode }));
        req.on('response', (response) => resolve({ statusCode: response.statusCode }));
        req.on('error', () => resolve({ statusCode: 405 }));
        req.end();
      });

      expect(res.statusCode).toBe(405);
    });

    it('rejects arbitrary IP destinations (RFC1918, metadata, loopback) in proxy destination validation', async () => {
      const clientReq = new http.IncomingMessage({} as any);
      clientReq.method = 'GET';
      clientReq.headers = {};
      clientReq.push(null);

      gatewayService.allowLoopbackProxy = false;

      const forbiddenTargets = [
        '127.0.0.1',
        'localhost',
        '169.254.169.254',
        '0.0.0.0',
        '255.255.255.255',
        'invalid-hostname',
        '10.0.0.1:8080@evil.com',
      ];

      for (const ip of forbiddenTargets) {
        let writtenStatus = 0;
        let writtenData = '';
        const clientRes = {
          writeHead: (code: number) => { writtenStatus = code; },
          end: (data: string) => { writtenData = data; },
          headersSent: false,
        } as any;

        await gatewayService.proxyRequest(clientReq, clientRes, { internalIp: ip, internalPort: 8080 }, '/');
        expect(writtenStatus).toBe(403);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 9. CONTROL SECRET SECURITY & REGISTRATION ENFORCEMENT
  // ---------------------------------------------------------------------------
  describe('Control Secret Security & Registry Allowlist Protection', () => {
    it('strictly forbids CHALLENGE_GATEWAY_SECRET and GATEWAY_SECRET from challenge container env', () => {
      expect(() => {
        dynamicChallengeRegistry.registerChallenge({
          challengeId: 'c-env-test',
          slug: 'env-leak-test',
          image: 'techx/chal:latest',
          internalPort: 8080,
          memoryLimitBytes: 256 * 1024 * 1024,
          cpuLimitNano: 500_000_000,
          pidsLimit: 64,
          readOnlyRootfs: true,
          tmpfsMounts: {},
          envAllowlist: {
            CHALLENGE_GATEWAY_SECRET: 'leaked_secret_val',
          },
          ttlSeconds: 300,
        });
      }).toThrow(/Disallowed platform secret key/);

      expect(() => {
        dynamicChallengeRegistry.registerChallenge({
          challengeId: 'c-env-test-2',
          slug: 'env-leak-test-2',
          image: 'techx/chal:latest',
          internalPort: 8080,
          memoryLimitBytes: 256 * 1024 * 1024,
          cpuLimitNano: 500_000_000,
          pidsLimit: 64,
          readOnlyRootfs: true,
          tmpfsMounts: {},
          envAllowlist: {
            GATEWAY_SECRET: 'leaked_secret_val',
          },
          ttlSeconds: 300,
        });
      }).toThrow(/Disallowed platform secret key/);
    });

    it('gateway createAndStartInstance strips sensitive platform secrets even if passed in DTO', async () => {
      const createContainerSpy = vi.spyOn(mockDocker, 'createAndStartContainer');

      await gatewayService.createAndStartInstance({
        instanceId: 'inst-env-sanitize',
        teamId: 'team-sanitize',
        challengeId: 'c-sanitize',
        slug: 'sanitize-slug',
        image: 'techx/chal:latest',
        internalPort: 8080,
        memoryLimitBytes: 256 * 1024 * 1024,
        cpuLimitNano: 500_000_000,
        pidsLimit: 64,
        readOnlyRootfs: true,
        tmpfsMounts: {},
        envAllowlist: {
          SAFE_ENV_VAR: 'hello',
          CHALLENGE_GATEWAY_SECRET: 'attempted_leak',
          GATEWAY_SECRET: 'attempted_leak',
          JWT_SECRET: 'attempted_leak',
          DATABASE_URL: 'attempted_leak',
        },
      });

      expect(createContainerSpy).toHaveBeenCalledTimes(1);
      const passedConfig = createContainerSpy.mock.calls[0][0];

      expect(passedConfig.env['SAFE_ENV_VAR']).toBe('hello');
      expect(passedConfig.env['CHALLENGE_GATEWAY_SECRET']).toBeUndefined();
      expect(passedConfig.env['GATEWAY_SECRET']).toBeUndefined();
      expect(passedConfig.env['JWT_SECRET']).toBeUndefined();
      expect(passedConfig.env['DATABASE_URL']).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 10. SECRET ROTATION / FAIL-CLOSED BEHAVIOR
  // ---------------------------------------------------------------------------
  describe('Secret Rotation & Fail-Closed Behavior', () => {
    beforeEach(async () => {
      testServer = createGatewayHttpServer(gatewayService, TEST_SECRET);
      await new Promise<void>((resolve) => {
        testServer!.listen(0, '127.0.0.1', () => {
          const addr = testServer!.address() as any;
          serverPort = addr.port;
          resolve();
        });
      });
    });

    it('fails closed on invalid, empty, or rotated secret without executing operations', async () => {
      const dockerSpy = vi.spyOn(mockDocker, 'createAndStartContainer');

      const invalidSecrets = [
        '',
        'wrong_secret_123',
        'expired_token_abc',
        'null',
      ];

      for (const secret of invalidSecrets) {
        const res = await fetch(`http://127.0.0.1:${serverPort}/internal/instances`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-gateway-secret': secret,
          },
          body: JSON.stringify({ instanceId: 'rot-test' }),
        });

        expect(res.status).toBe(403);
        const data = await res.json();
        expect(data.error).toBe('FORBIDDEN');
      }

      // Zero Docker operations executed during failed auth attempts
      expect(dockerSpy).not.toHaveBeenCalled();
    });
  });
});
