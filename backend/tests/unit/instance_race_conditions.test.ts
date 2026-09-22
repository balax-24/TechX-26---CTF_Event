import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DynamicChallengesService } from '../../src/modules/dynamic_challenges/dynamic_challenges.service.js';
import { setDockerManager, MockDockerManager } from '../../src/modules/dynamic_challenges/docker.manager.js';
import { db } from '../../src/db/index.js';
import { challenges, challengeInstances, teams } from '../../src/db/schema.js';
import { competitionService } from '../../src/modules/competition/competition.service.js';
import { auditService } from '../../src/modules/admin/audit.service.js';

describe('Stage 8 Hardening: Concurrency Races (Reset, Start, Stop, Capacity)', () => {
  let service: DynamicChallengesService;
  let mockDocker: MockDockerManager;

  const validChallenge = {
    id: 'c1111111-1111-4111-8111-111111111111',
    slug: 'intro-sqli-sandbox',
    status: 'published',
    releaseTime: null,
  };

  const validTeam = {
    id: 't1111111-1111-4111-8111-111111111111',
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

  function setupDbSimulation(instancesInDb: any[], options?: { getGlobalCount?: () => number }) {
    vi.spyOn(db, 'select').mockImplementation(((fields: any) => {
      return {
        from: vi.fn().mockImplementation((table: any) => {
          if (table === teams) {
            const p = Promise.resolve([validTeam]);
            (p as any).limit = vi.fn().mockReturnValue(Promise.resolve([validTeam]));
            return { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([validTeam]) }) };
          }

          if (table === challenges) {
            return { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([validChallenge]) }) };
          }

          // challengeInstances table
          return {
            where: vi.fn().mockImplementation((condition: any) => {
              const getResults = () => {
                if (fields?.count) {
                  if (options?.getGlobalCount) {
                    // and(...) starts with '(' StringChunk, inArray starts with Column
                    const isTeamQuery = condition?.queryChunks?.[0]?.value?.[0] === '(';
                    if (isTeamQuery) {
                      return [{ count: 0 }]; // Team is within quota
                    }
                    return [{ count: options.getGlobalCount() }];
                  }
                  const active = instancesInDb.filter((i) => ['CREATING', 'RUNNING'].includes(i.status));
                  return [{ count: active.length }];
                }

                // Return active instances from instancesInDb
                const active = instancesInDb.filter((i) => ['CREATING', 'RUNNING'].includes(i.status));
                return active;
              };

              const p = Promise.resolve(getResults());
              (p as any).limit = vi.fn().mockImplementation((n: number) => {
                return Promise.resolve(getResults().slice(0, n));
              });
              return p;
            }),
          };
        }),
      } as any;
    }));

    vi.spyOn(db, 'insert').mockImplementation((() => ({
      values: vi.fn().mockImplementation((val: any) => {
        const row = { ...val, createdAt: new Date() };
        instancesInDb.push(row);
        const p = Promise.resolve([row]);
        (p as any).returning = vi.fn().mockReturnValue(Promise.resolve([row]));
        return p;
      }),
    })) as any);

    vi.spyOn(db, 'update').mockImplementation((() => ({
      set: vi.fn().mockImplementation((updates: any) => ({
        where: vi.fn().mockImplementation((condition: any) => {
          let targetId: string | undefined;
          if (condition?.queryChunks) {
            for (const chunk of condition.queryChunks) {
              if (chunk?.value && typeof chunk.value === 'string' && chunk.value.length > 10) {
                targetId = chunk.value;
              }
            }
          }
          let updatedRow: any;
          for (const inst of instancesInDb) {
            if (!targetId || inst.id === targetId) {
              Object.assign(inst, updates);
              updatedRow = inst;
            }
          }
          const row = updatedRow || instancesInDb[instancesInDb.length - 1] || {};
          const p = Promise.resolve([row]);
          (p as any).returning = vi.fn().mockReturnValue(Promise.resolve([row]));
          return p;
        }),
      })),
    })) as any);
  }

  // ---------------------------------------------------------------------------
  // 1. RESET + RESET CONCURRENCY (Requirement 14)
  // ---------------------------------------------------------------------------
  it('handles simultaneous reset + reset calls without leaking containers or producing duplicate active instances', async () => {
    const instancesInDb: any[] = [];
    setupDbSimulation(instancesInDb);

    // Initial start
    await service.startInstance({
      slug: 'intro-sqli-sandbox',
      userId: 'u-1',
      teamId: validTeam.id,
      ipAddress: '127.0.0.1',
    });

    expect(mockDocker.containers.size).toBe(1);

    // Fire TWO concurrent reset calls simultaneously
    const [reset1, reset2] = await Promise.all([
      service.resetInstance({
        slug: 'intro-sqli-sandbox',
        userId: 'u-1',
        teamId: validTeam.id,
        ipAddress: '127.0.0.1',
      }),
      service.resetInstance({
        slug: 'intro-sqli-sandbox',
        userId: 'u-1',
        teamId: validTeam.id,
        ipAddress: '127.0.0.1',
      }),
    ]);

    // Expected:
    // 1. Both calls resolve successfully
    expect(reset1.status).toBe('RUNNING');
    expect(reset2.status).toBe('RUNNING');
    // 2. Exactly ONE container is running in Docker (zero leaked old containers)
    expect(mockDocker.containers.size).toBe(1);
    // 3. Exactly ONE active instance in DB
    const activeInstances = instancesInDb.filter((i) => ['CREATING', 'RUNNING'].includes(i.status));
    expect(activeInstances.length).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 2. START + RESET CONCURRENCY (Requirement 14)
  // ---------------------------------------------------------------------------
  it('handles simultaneous start + reset calls safely without container leakage', async () => {
    const instancesInDb: any[] = [];
    setupDbSimulation(instancesInDb);

    // Concurrently start and reset
    const [startRes, resetRes] = await Promise.all([
      service.startInstance({
        slug: 'intro-sqli-sandbox',
        userId: 'u-1',
        teamId: validTeam.id,
        ipAddress: '127.0.0.1',
      }),
      service.resetInstance({
        slug: 'intro-sqli-sandbox',
        userId: 'u-1',
        teamId: validTeam.id,
        ipAddress: '127.0.0.1',
      }),
    ]);

    expect(startRes.status).toBe('RUNNING');
    expect(resetRes.status).toBe('RUNNING');
    // Docker must hold exactly 1 active container
    expect(mockDocker.containers.size).toBe(1);
    const activeInstances = instancesInDb.filter((i) => ['CREATING', 'RUNNING'].includes(i.status));
    expect(activeInstances.length).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 3. STOP + RESET CONCURRENCY (Requirement 14)
  // ---------------------------------------------------------------------------
  it('handles simultaneous stop + reset calls cleanly without zombie state', async () => {
    const instancesInDb: any[] = [];
    setupDbSimulation(instancesInDb);

    // Initial start
    await service.startInstance({
      slug: 'intro-sqli-sandbox',
      userId: 'u-1',
      teamId: validTeam.id,
      ipAddress: '127.0.0.1',
    });

    expect(mockDocker.containers.size).toBe(1);

    // Concurrently stop and reset
    await Promise.all([
      service.stopInstance({
        slug: 'intro-sqli-sandbox',
        userId: 'u-1',
        teamId: validTeam.id,
        ipAddress: '127.0.0.1',
      }),
      service.resetInstance({
        slug: 'intro-sqli-sandbox',
        userId: 'u-1',
        teamId: validTeam.id,
        ipAddress: '127.0.0.1',
      }),
    ]);

    // Docker state must match DB state
    const activeInstances = instancesInDb.filter((i) => ['CREATING', 'RUNNING'].includes(i.status));
    expect(mockDocker.containers.size).toBe(activeInstances.length);
  });

  // ---------------------------------------------------------------------------
  // 4. GLOBAL CAPACITY CONCURRENCY RACE (Requirement 15)
  // ---------------------------------------------------------------------------
  it('strictly enforces global capacity under simultaneous burst at capacity boundary', async () => {
    service.MAX_GLOBAL_INSTANCES = 100;
    let globalCount = 99; // 1 slot remaining

    const instancesInDb: any[] = [];
    setupDbSimulation(instancesInDb, {
      getGlobalCount: () => globalCount,
    });

    vi.spyOn(db, 'insert').mockImplementation((() => ({
      values: vi.fn().mockImplementation((val: any) => {
        globalCount++; // Atomically increments on insert
        const row = { ...val, createdAt: new Date() };
        instancesInDb.push(row);
        const p = Promise.resolve([row]);
        (p as any).returning = vi.fn().mockReturnValue(Promise.resolve([row]));
        return p;
      }),
    })) as any);

    // Fire 5 simultaneous start requests from different teams
    const startAttempts = await Promise.allSettled([
      service.startInstance({ slug: 'intro-sqli-sandbox', userId: 'u-1', teamId: 'team-1', ipAddress: '127.0.0.1' }),
      service.startInstance({ slug: 'intro-sqli-sandbox', userId: 'u-2', teamId: 'team-2', ipAddress: '127.0.0.1' }),
      service.startInstance({ slug: 'intro-sqli-sandbox', userId: 'u-3', teamId: 'team-3', ipAddress: '127.0.0.1' }),
      service.startInstance({ slug: 'intro-sqli-sandbox', userId: 'u-4', teamId: 'team-4', ipAddress: '127.0.0.1' }),
      service.startInstance({ slug: 'intro-sqli-sandbox', userId: 'u-5', teamId: 'team-5', ipAddress: '127.0.0.1' }),
    ]);

    const fulfilled = startAttempts.filter((r) => r.status === 'fulfilled');
    const rejected = startAttempts.filter((r) => r.status === 'rejected');
    if (fulfilled.length === 0) {
      console.log('REJECTION REASONS:', rejected.map((r: any) => r.reason?.message || String(r.reason)));
    }

    // Exactly 1 must succeed (filling the 100th slot)
    expect(fulfilled.length).toBe(1);
    // Exactly 4 must fail with CHALLENGE_CAPACITY_EXCEEDED
    expect(rejected.length).toBe(4);
    for (const rej of rejected) {
      expect((rej as PromiseRejectedResult).reason.message).toBe('CHALLENGE_CAPACITY_EXCEEDED');
    }

    // Global count must be 100 (never exceeded)
    expect(globalCount).toBe(100);
  });
});
