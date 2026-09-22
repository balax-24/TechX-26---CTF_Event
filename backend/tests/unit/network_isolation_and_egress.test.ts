import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockDockerManager } from '../../src/modules/dynamic_challenges/docker.manager.js';
import { DynamicChallengesService } from '../../src/modules/dynamic_challenges/dynamic_challenges.service.js';
import { db } from '../../src/db/index.js';
import { competitionService } from '../../src/modules/competition/competition.service.js';
import { auditService } from '../../src/modules/admin/audit.service.js';

describe('Stage 8 Hardening: Runtime Network Isolation & Egress Policy Verification', () => {
  let mockDocker: MockDockerManager;
  let service: DynamicChallengesService;

  beforeEach(() => {
    mockDocker = new MockDockerManager();
    service = new DynamicChallengesService();
    vi.restoreAllMocks();
    vi.spyOn(competitionService, 'requireLiveCompetition').mockResolvedValue(undefined);
    vi.spyOn(auditService, 'record').mockResolvedValue(undefined);
  });

  // ---------------------------------------------------------------------------
  // 1. CORE SERVICE ISOLATION (Requirement 1)
  // ---------------------------------------------------------------------------
  it('strictly blocks challenge containers from reaching PostgreSQL (ctf_core_net:5432)', async () => {
    const container = await mockDocker.createAndStartContainer({
      containerName: 'techx26-inst-team-a',
      image: 'techx/test:latest',
      networkName: 'techx-inst-net-teama',
      internalPort: 8080,
      memoryLimitBytes: 256 * 1024 * 1024,
      cpuLimitNano: 500_000_000,
      pidsLimit: 64,
      readOnlyRootfs: true,
      tmpfsMounts: {},
      env: {},
      labels: {
        'techx.managed': 'true',
        'techx.component': 'ctf-challenge',
        'techx.instance_id': 'inst-a',
      },
    });

    // Attempt direct TCP connection to PostgreSQL
    const conn1 = mockDocker.simulateNetworkConnection(container.containerId, 'postgres', 5432);
    expect(conn1.allowed).toBe(false);
    expect(conn1.reason).toContain('Database network (ctf_core_net) is strictly isolated');

    const conn2 = mockDocker.simulateNetworkConnection(container.containerId, '172.20.0.2', 5432);
    expect(conn2.allowed).toBe(false);
    expect(conn2.reason).toContain('Database network (ctf_core_net) is strictly isolated');
  });

  it('strictly blocks challenge containers from reaching Redis cache (ctf_core_net:6379)', async () => {
    const container = await mockDocker.createAndStartContainer({
      containerName: 'techx26-inst-team-a',
      image: 'techx/test:latest',
      networkName: 'techx-inst-net-teama',
      internalPort: 8080,
      memoryLimitBytes: 256 * 1024 * 1024,
      cpuLimitNano: 500_000_000,
      pidsLimit: 64,
      readOnlyRootfs: true,
      tmpfsMounts: {},
      env: {},
      labels: {
        'techx.managed': 'true',
        'techx.component': 'ctf-challenge',
        'techx.instance_id': 'inst-a',
      },
    });

    const conn1 = mockDocker.simulateNetworkConnection(container.containerId, 'redis', 6379);
    expect(conn1.allowed).toBe(false);
    expect(conn1.reason).toContain('Redis cache network (ctf_core_net) is strictly isolated');

    const conn2 = mockDocker.simulateNetworkConnection(container.containerId, '172.20.0.3', 6379);
    expect(conn2.allowed).toBe(false);
    expect(conn2.reason).toContain('Redis cache network (ctf_core_net) is strictly isolated');
  });

  it('strictly blocks challenge containers from reaching internal backend management port', async () => {
    const container = await mockDocker.createAndStartContainer({
      containerName: 'techx26-inst-team-a',
      image: 'techx/test:latest',
      networkName: 'techx-inst-net-teama',
      internalPort: 8080,
      memoryLimitBytes: 256 * 1024 * 1024,
      cpuLimitNano: 500_000_000,
      pidsLimit: 64,
      readOnlyRootfs: true,
      tmpfsMounts: {},
      env: {},
      labels: {
        'techx.managed': 'true',
        'techx.component': 'ctf-challenge',
        'techx.instance_id': 'inst-a',
      },
    });

    const conn = mockDocker.simulateNetworkConnection(container.containerId, '172.20.0.10', 4000);
    expect(conn.allowed).toBe(false);
    expect(conn.reason).toContain('Internal backend management port is unreachable');
  });

  it('strictly blocks challenge containers from mounting or accessing the Docker daemon socket', async () => {
    const container = await mockDocker.createAndStartContainer({
      containerName: 'techx26-inst-team-a',
      image: 'techx/test:latest',
      networkName: 'techx-inst-net-teama',
      internalPort: 8080,
      memoryLimitBytes: 256 * 1024 * 1024,
      cpuLimitNano: 500_000_000,
      pidsLimit: 64,
      readOnlyRootfs: true,
      tmpfsMounts: {},
      env: {},
      labels: {
        'techx.managed': 'true',
        'techx.component': 'ctf-challenge',
        'techx.instance_id': 'inst-a',
      },
    });

    const conn = mockDocker.simulateNetworkConnection(container.containerId, '/var/run/docker.sock', 0);
    expect(conn.allowed).toBe(false);
    expect(conn.reason).toContain('Docker daemon socket not mounted');
  });

  // ---------------------------------------------------------------------------
  // 2. EGRESS POLICY (Requirement 3)
  // ---------------------------------------------------------------------------
  it('denies outbound WAN / Internet access via internal bridge policy', async () => {
    await mockDocker.createNetwork('techx-inst-net-teama', { internal: true, icc: false });

    const container = await mockDocker.createAndStartContainer({
      containerName: 'techx26-inst-team-a',
      image: 'techx/test:latest',
      networkName: 'techx-inst-net-teama',
      internalPort: 8080,
      memoryLimitBytes: 256 * 1024 * 1024,
      cpuLimitNano: 500_000_000,
      pidsLimit: 64,
      readOnlyRootfs: true,
      tmpfsMounts: {},
      env: {},
      labels: {
        'techx.managed': 'true',
        'techx.component': 'ctf-challenge',
        'techx.instance_id': 'inst-a',
      },
    });

    // Test external public IP addresses (Google DNS, Cloudflare DNS)
    const connGoogleDns = mockDocker.simulateNetworkConnection(container.containerId, '8.8.8.8', 53);
    expect(connGoogleDns.allowed).toBe(false);
    expect(connGoogleDns.reason).toContain('Challenge network is configured as internal (no default gateway to WAN)');

    const connCloudflare = mockDocker.simulateNetworkConnection(container.containerId, '1.1.1.1', 443);
    expect(connCloudflare.allowed).toBe(false);
    expect(connCloudflare.reason).toContain('Challenge network is configured as internal (no default gateway to WAN)');
  });

  // ---------------------------------------------------------------------------
  // 3. CHALLENGE-TO-CHALLENGE ISOLATION (Requirement 1 & 10)
  // ---------------------------------------------------------------------------
  it('guarantees Team A challenge container CANNOT connect to Team B challenge container across per-instance networks', async () => {
    // 1. Create Team A instance on isolated network A
    await mockDocker.createNetwork('techx-inst-net-teama', { internal: true, icc: false });
    const containerA = await mockDocker.createAndStartContainer({
      containerName: 'techx26-inst-team-a',
      image: 'techx/challenge-sqli:latest',
      networkName: 'techx-inst-net-teama',
      internalPort: 8080,
      memoryLimitBytes: 256 * 1024 * 1024,
      cpuLimitNano: 500_000_000,
      pidsLimit: 64,
      readOnlyRootfs: true,
      tmpfsMounts: {},
      env: {},
      labels: {
        'techx.managed': 'true',
        'techx.component': 'ctf-challenge',
        'techx.instance_id': 'inst-a',
        'techx.team_id': 'team-a',
      },
    });

    // 2. Create Team B instance on isolated network B
    await mockDocker.createNetwork('techx-inst-net-teamb', { internal: true, icc: false });
    const containerB = await mockDocker.createAndStartContainer({
      containerName: 'techx26-inst-team-b',
      image: 'techx/challenge-sqli:latest',
      networkName: 'techx-inst-net-teamb',
      internalPort: 8080,
      memoryLimitBytes: 256 * 1024 * 1024,
      cpuLimitNano: 500_000_000,
      pidsLimit: 64,
      readOnlyRootfs: true,
      tmpfsMounts: {},
      env: {},
      labels: {
        'techx.managed': 'true',
        'techx.component': 'ctf-challenge',
        'techx.instance_id': 'inst-b',
        'techx.team_id': 'team-b',
      },
    });

    // 3. Attempt controlled TCP/HTTP connectivity from Team A container to Team B container IP
    const connAtoB = mockDocker.simulateNetworkConnection(
      containerA.containerId,
      containerB.internalIp,
      containerB.internalPort
    );

    expect(connAtoB.allowed).toBe(false);
    expect(connAtoB.reason).toContain('Distinct per-instance Docker networks prevent inter-team communication');

    // 4. Attempt controlled TCP/HTTP connectivity from Team B container to Team A container IP
    const connBtoA = mockDocker.simulateNetworkConnection(
      containerB.containerId,
      containerA.internalIp,
      containerA.internalPort
    );

    expect(connBtoA.allowed).toBe(false);
    expect(connBtoA.reason).toContain('Distinct per-instance Docker networks prevent inter-team communication');
  });
});
