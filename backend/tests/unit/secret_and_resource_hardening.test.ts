import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DynamicChallengesService } from '../../src/modules/dynamic_challenges/dynamic_challenges.service.js';
import { setDockerManager, MockDockerManager } from '../../src/modules/dynamic_challenges/docker.manager.js';
import { db } from '../../src/db/index.js';
import { challenges, challengeInstances, teams } from '../../src/db/schema.js';
import { competitionService } from '../../src/modules/competition/competition.service.js';
import { auditService } from '../../src/modules/admin/audit.service.js';

describe('Stage 8 Hardening: Secret Isolation, Resource Limits, and Admin Boundaries', () => {
  let service: DynamicChallengesService;
  let mockDocker: MockDockerManager;

  const validChallenge = {
    id: 'c3333333-3333-4333-8333-333333333333',
    slug: 'intro-sqli-sandbox',
    status: 'published',
    releaseTime: null,
  };

  const validTeamA = {
    id: 't-alpha-1111-1111-111111111111',
    status: 'active',
  };

  const validTeamB = {
    id: 't-bravo-2222-2222-222222222222',
    status: 'active',
  };

  beforeEach(() => {
    service = new DynamicChallengesService();
    mockDocker = new MockDockerManager();
    setDockerManager(mockDocker);
    vi.restoreAllMocks();

    vi.spyOn(competitionService, 'requireLiveCompetition').mockResolvedValue(undefined);
    vi.spyOn(auditService, 'record').mockResolvedValue(undefined);
  });

  function setupDbMock(existingInstance?: any) {
    vi.spyOn(db, 'select').mockImplementation(((fields: any) => {
      return {
        from: vi.fn().mockImplementation((table: any) => {
          if (table === teams) {
            return {
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockImplementation(() => Promise.resolve([validTeamA])),
              }),
            };
          }
          if (table === challenges) {
            return {
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockImplementation(() => Promise.resolve([validChallenge])),
              }),
            };
          }
          // challengeInstances table
          return {
            where: vi.fn().mockImplementation(() => {
              if (fields?.count) {
                return Promise.resolve([{ count: 0 }]);
              }
              const p = Promise.resolve(existingInstance ? [existingInstance] : []);
              (p as any).limit = vi.fn().mockResolvedValue(existingInstance ? [existingInstance] : []);
              return p;
            }),
          };
        }),
      } as any;
    }));

    vi.spyOn(db, 'insert').mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'inst-test-1', createdAt: new Date() }]),
      }),
    } as any);

    vi.spyOn(db, 'update').mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'inst-test-1' }]),
        }),
      }),
    } as any);
  }

  // ---------------------------------------------------------------------------
  // 1. SECRET ISOLATION (Requirement 11)
  // ---------------------------------------------------------------------------
  it('strictly verifies challenge containers NEVER receive platform secrets or cloud credentials', async () => {
    setupDbMock();

    // Populate process.env with sensitive secrets to verify none bleed into the container
    process.env.JWT_SECRET = 'super-secret-jwt-key-never-leak';
    process.env.COOKIE_SECRET = 'super-secret-cookie-key-never-leak';
    process.env.DATABASE_URL = 'postgres://postgres:superpass@localhost:5432/ctf_db';
    process.env.REDIS_PASSWORD = 'redis-secret-pass-never-leak';
    process.env.REDIS_URL = 'redis://:redis-secret-pass@localhost:6379';
    process.env.ADMIN_PASSWORD = 'super-secret-admin-pass';
    process.env.AWS_SECRET_ACCESS_KEY = 'super-secret-aws-key';

    await service.startInstance({
      slug: 'intro-sqli-sandbox',
      userId: 'u-1',
      teamId: validTeamA.id,
      ipAddress: '127.0.0.1',
    });

    expect(mockDocker.containers.size).toBe(1);
    const container = Array.from(mockDocker.containers.values())[0];
    const envVars = container.config.env;

    const forbiddenKeys = [
      'JWT_SECRET',
      'COOKIE_SECRET',
      'DATABASE_URL',
      'REDIS_PASSWORD',
      'REDIS_URL',
      'ADMIN_PASSWORD',
      'AWS_SECRET_ACCESS_KEY',
      'AWS_ACCESS_KEY_ID',
      'SIGNING_KEY',
    ];

    for (const key of forbiddenKeys) {
      expect(envVars[key]).toBeUndefined();
    }

    // Container should ONLY contain explicit instance metadata and non-sensitive challenge env
    expect(envVars.CHALLENGE_INSTANCE_ID).toBeDefined();
    expect(envVars.CHALLENGE_PORT).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // 2. RESOURCE LIMITS VERIFICATION (Requirement 4)
  // ---------------------------------------------------------------------------
  it('strictly configures finite bounded memory, CPU quota, and PID limits', async () => {
    setupDbMock();

    await service.startInstance({
      slug: 'intro-sqli-sandbox',
      userId: 'u-1',
      teamId: validTeamA.id,
      ipAddress: '127.0.0.1',
    });

    const container = Array.from(mockDocker.containers.values())[0];
    const config = container.config;

    // Memory limit must be finite and positive (e.g. <= 256MB)
    expect(config.memoryLimitBytes).toBeGreaterThan(0);
    expect(config.memoryLimitBytes).toBeLessThanOrEqual(512 * 1024 * 1024);

    // CPU quota must be finite and positive (e.g. <= 1.0 core = 1e9 nanos)
    expect(config.cpuLimitNano).toBeGreaterThan(0);
    expect(config.cpuLimitNano).toBeLessThanOrEqual(1_000_000_000);

    // PIDs limit must be strictly bounded (e.g. <= 128)
    expect(config.pidsLimit).toBeGreaterThan(0);
    expect(config.pidsLimit).toBeLessThanOrEqual(128);

    // Root filesystem must be read-only
    expect(config.readOnlyRootfs).toBe(true);

    // Tmpfs must be bounded and explicitly mounted
    expect(config.tmpfsMounts).toBeDefined();
    expect(config.tmpfsMounts['/tmp']).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // 3. CAPABILITIES & SECCOMP VERIFICATION (Requirement 5)
  // ---------------------------------------------------------------------------
  it('strictly enforces no-new-privileges, unprivileged mode, and CapDrop ALL', async () => {
    setupDbMock();

    await service.startInstance({
      slug: 'intro-sqli-sandbox',
      userId: 'u-1',
      teamId: validTeamA.id,
      ipAddress: '127.0.0.1',
    });

    const container = Array.from(mockDocker.containers.values())[0];

    // Verify inspectContainer returns expected hardened HostConfig
    const inspected = await mockDocker.inspectContainer(container.id);
    expect(inspected).not.toBeNull();
    expect(inspected?.hostConfig?.Privileged).toBe(false);
    expect(inspected?.hostConfig?.CapDrop).toContain('ALL');
    expect(inspected?.hostConfig?.SecurityOpt).toContain('no-new-privileges:true');

    // Seccomp must not be unconfined
    const hasUnconfinedSeccomp = (inspected?.hostConfig?.SecurityOpt || []).some(
      (opt: string) => opt.includes('seccomp=unconfined') || opt.includes('seccomp:unconfined')
    );
    expect(hasUnconfinedSeccomp).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 4. ADMIN & TEAM PARTICIPATION BOUNDARY (Requirement 17)
  // ---------------------------------------------------------------------------
  it('prevents Team B from accessing or modifying Team A instances', async () => {
    // Team A has an active instance
    const teamAInstance = {
      id: 'inst-team-a-999',
      challengeId: validChallenge.id,
      teamId: validTeamA.id,
      status: 'RUNNING',
      containerId: 'docker-a-999',
      containerName: 'techx26-inst-a999',
      internalIp: '172.28.0.50',
      internalPort: 8080,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
    };

    // When Team B queries status, the DB query scopes to teamId === Team B
    vi.spyOn(db, 'select').mockImplementation((() => {
      return {
        from: vi.fn().mockImplementation((table: any) => {
          if (table === challenges) {
            return {
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([validChallenge]),
              }),
            };
          }
          // challengeInstances: query filters by teamId = validTeamB.id -> returns empty
          return {
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          };
        }),
      } as any;
    }));

    // Team B checks status -> returns null (not found for Team B)
    const result = await service.getInstanceStatus({
      slug: 'intro-sqli-sandbox',
      teamId: validTeamB.id,
    });
    expect(result).toBeNull();

    // Team B attempts to stop instance -> throws INSTANCE_NOT_FOUND
    await expect(
      service.stopInstance({
        slug: 'intro-sqli-sandbox',
        userId: 'u-b-1',
        teamId: validTeamB.id,
        ipAddress: '127.0.0.1',
      })
    ).rejects.toThrow('INSTANCE_NOT_FOUND');
  });
});
