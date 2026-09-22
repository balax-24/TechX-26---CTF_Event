import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InstanceCleanupWorker } from '../../src/modules/dynamic_challenges/cleanup.worker.js';
import { setDockerManager, MockDockerManager } from '../../src/modules/dynamic_challenges/docker.manager.js';
import { db } from '../../src/db/index.js';
import { auditService } from '../../src/modules/admin/audit.service.js';
import { competitionService } from '../../src/modules/competition/competition.service.js';

describe('Stage 8 Hardening: Orphan Reaper Safety & Container Label Trust Model', () => {
  let worker: InstanceCleanupWorker;
  let mockDocker: MockDockerManager;

  beforeEach(() => {
    worker = new InstanceCleanupWorker();
    mockDocker = new MockDockerManager();
    setDockerManager(mockDocker);
    vi.restoreAllMocks();
    vi.spyOn(competitionService, 'getCompetitionState').mockResolvedValue({ state: 'live', isSubmissionEnabled: true } as any);
    vi.spyOn(auditService, 'record').mockResolvedValue(undefined);
  });

  // ---------------------------------------------------------------------------
  // 1. SURVIVAL OF VALID MANAGED CONTAINERS (Requirement 13)
  // ---------------------------------------------------------------------------
  it('preserves valid managed containers that have a corresponding active DB record', async () => {
    const validContainer = await mockDocker.createAndStartContainer({
      containerName: 'techx26-inst-valid-1',
      image: 'techx/test:latest',
      networkName: 'techx-inst-net-valid',
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
        'techx.instance_id': 'inst-valid-uuid-1',
        'techx.team_id': 'team-valid-1',
      },
    });

    // DB contains matching RUNNING instance
    vi.spyOn(db, 'select').mockImplementation(((fields: any) => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          if (fields?.id && !fields?.containerId) {
            // TTL check: returns empty (no expired instances)
            return Promise.resolve([]);
          }
          return Promise.resolve([
            {
              id: 'inst-valid-uuid-1',
              containerId: validContainer.containerId,
              containerName: validContainer.containerName,
              status: 'RUNNING',
              expiresAt: new Date(Date.now() + 600000),
            },
          ]);
        }),
      }),
    })) as any);

    const result = await worker.reconcile();

    expect(result.orphansReaped).toBe(0);
    expect(mockDocker.containers.size).toBe(1);
    expect(mockDocker.containers.get(validContainer.containerId)?.state).toBe('running');
  });

  // ---------------------------------------------------------------------------
  // 2. ORPHAN REAPING (Requirement 13)
  // ---------------------------------------------------------------------------
  it('reaps managed containers when their DB record is absent or deleted', async () => {
    const orphanContainer = await mockDocker.createAndStartContainer({
      containerName: 'techx26-inst-orphan-1',
      image: 'techx/test:latest',
      networkName: 'techx-inst-net-orphan',
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
        'techx.instance_id': 'inst-orphan-uuid-999',
      },
    });

    // DB returns 0 active instances
    vi.spyOn(db, 'select').mockImplementation((() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    })) as any);

    const result = await worker.reconcile();

    expect(result.orphansReaped).toBe(1);
    expect(mockDocker.containers.size).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 3. UNMANAGED CONTAINER PROTECTION & LABEL SECURITY (Requirement 12 & 13)
  // ---------------------------------------------------------------------------
  it('strictly NEVER touches unmanaged containers (host containers, redis, postgres)', async () => {
    // External unmanaged container on the Docker host (e.g. host redis or database)
    const hostDbContainerId = 'host-postgres-container';
    mockDocker.containers.set(hostDbContainerId, {
      id: hostDbContainerId,
      name: 'production-postgres-db',
      config: {
        containerName: 'production-postgres-db',
        image: 'postgres:16',
        networkName: 'ctf_core_net',
        internalPort: 5432,
        memoryLimitBytes: 1024 * 1024 * 1024,
        cpuLimitNano: 1_000_000_000,
        pidsLimit: 256,
        readOnlyRootfs: false,
        tmpfsMounts: {},
        env: {},
        labels: {
          // Notice: NO techx.managed label!
          'app.kubernetes.io/name': 'postgres',
        },
      },
      state: 'running',
      ipAddress: '172.20.0.2',
      port: 5432,
      created: new Date(),
      healthy: true,
    });

    // DB has 0 challenge instances
    vi.spyOn(db, 'select').mockImplementation((() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    })) as any);

    const result = await worker.reconcile();

    expect(result.orphansReaped).toBe(0);
    // Host database container must remain completely untouched and running!
    expect(mockDocker.containers.has(hostDbContainerId)).toBe(true);
    expect(mockDocker.containers.get(hostDbContainerId)?.state).toBe('running');
  });

  it('strictly ignores containers with similar/spoofed names if they lack trusted labels', async () => {
    // Attacker or unrelated developer spawned container named like a CTF instance
    const spoofedId = 'spoofed-attacker-container';
    mockDocker.containers.set(spoofedId, {
      id: spoofedId,
      name: 'techx26-inst-fake-exploit-container',
      config: {
        containerName: 'techx26-inst-fake-exploit-container',
        image: 'alpine:latest',
        networkName: 'bridge',
        internalPort: 80,
        memoryLimitBytes: 128 * 1024 * 1024,
        cpuLimitNano: 250_000_000,
        pidsLimit: 32,
        readOnlyRootfs: false,
        tmpfsMounts: {},
        env: {},
        labels: {
          // No techx.managed label
          'user.note': 'unrelated-host-task',
        },
      },
      state: 'running',
      ipAddress: '172.17.0.5',
      port: 80,
      created: new Date(),
      healthy: true,
    });

    vi.spyOn(db, 'select').mockImplementation((() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    })) as any);

    const result = await worker.reconcile();

    expect(result.orphansReaped).toBe(0);
    expect(mockDocker.containers.has(spoofedId)).toBe(true);
  });

  it('strictly ignores containers belonging to other platform components (e.g. techx.component=database)', async () => {
    const internalComponent = await mockDocker.createAndStartContainer({
      containerName: 'techx-core-database',
      image: 'postgres:16',
      networkName: 'ctf_core_net',
      internalPort: 5432,
      memoryLimitBytes: 1024 * 1024 * 1024,
      cpuLimitNano: 1_000_000_000,
      pidsLimit: 256,
      readOnlyRootfs: false,
      tmpfsMounts: {},
      env: {},
      labels: {
        'techx.managed': 'true',
        'techx.component': 'core-infrastructure', // NOT ctf-challenge!
      },
    });

    vi.spyOn(db, 'select').mockImplementation((() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    })) as any);

    const result = await worker.reconcile();

    expect(result.orphansReaped).toBe(0);
    expect(mockDocker.containers.has(internalComponent.containerId)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 4. MALFORMED LABEL RESILIENCE (Fail-Closed)
  // ---------------------------------------------------------------------------
  it('handles containers with malformed or missing labels safely without crashing', async () => {
    // Malformed labels (empty or strange structure)
    const malformedContainer = await mockDocker.createAndStartContainer({
      containerName: 'techx26-inst-corrupt',
      image: 'techx/test:latest',
      networkName: 'techx-inst-net-corrupt',
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
        'techx.instance_id': '', // Empty instance ID
      },
    });

    vi.spyOn(db, 'select').mockImplementation((() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    })) as any);

    // Should reap the corrupt challenge container safely without throwing
    const result = await worker.reconcile();
    expect(result.orphansReaped).toBe(1);
    expect(mockDocker.containers.size).toBe(0);
  });
});
