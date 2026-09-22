import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { PassThrough } from 'stream';
import { ChallengeGatewayService, createGatewayHttpServer } from '../../src/modules/dynamic_challenges/challenge_gateway.service.js';
import { MockDockerManager } from '../../src/modules/dynamic_challenges/docker.manager.js';

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
  });
});
