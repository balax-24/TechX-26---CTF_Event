import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DynamicChallengesService } from '../../src/modules/dynamic_challenges/dynamic_challenges.service.js';
import { setDockerManager, MockDockerManager } from '../../src/modules/dynamic_challenges/docker.manager.js';
import { db } from '../../src/db/index.js';
import { competitionService } from '../../src/modules/competition/competition.service.js';
import { auditService } from '../../src/modules/admin/audit.service.js';

describe('Stage 8: Dynamic Challenge Concurrency & Idempotency', () => {
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

  it('guarantees start idempotency: repeated/concurrent start calls return existing instance and do not spawn duplicate containers', async () => {
    const existingActive = {
      id: 'inst-active-123',
      challengeId: validChallenge.id,
      teamId: validTeam.id,
      userId: 'u-1',
      status: 'RUNNING',
      containerId: 'mock-container-active',
      containerName: 'techx26-inst-active-123',
      internalPort: 8080,
      accessToken: 'token-abc',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 1800000), // 30m in future
      stoppedAt: null,
      failureReason: null,
    };

    vi.spyOn(db, 'select').mockImplementation(((fields: any) => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => {
            if (fields?.slug) return Promise.resolve([validChallenge]);
            if (fields?.containerName || fields?.challengeId) return Promise.resolve([existingActive]);
            if (fields?.status && !fields?.slug) return Promise.resolve([validTeam]);
            return Promise.resolve([]);
          }),
        }),
      }),
    })) as any);

    const insertSpy = vi.spyOn(db, 'insert');

    // Fire 3 simultaneous start calls (e.g. rapid double clicks)
    const results = await Promise.all([
      service.startInstance({ slug: 'intro-sqli-sandbox', userId: 'u-1', teamId: validTeam.id, ipAddress: '127.0.0.1' }),
      service.startInstance({ slug: 'intro-sqli-sandbox', userId: 'u-1', teamId: validTeam.id, ipAddress: '127.0.0.1' }),
      service.startInstance({ slug: 'intro-sqli-sandbox', userId: 'u-1', teamId: validTeam.id, ipAddress: '127.0.0.1' }),
    ]);

    expect(results).toHaveLength(3);
    expect(results[0].id).toBe('inst-active-123');
    expect(results[1].id).toBe('inst-active-123');
    expect(results[2].id).toBe('inst-active-123');
    expect(insertSpy).not.toHaveBeenCalled();
    expect(mockDocker.containers.size).toBe(0); // Zero additional containers created
  });

  it('strictly enforces maximum dynamic instances per team quota', async () => {
    // Mock that team already has 2 active instances
    vi.spyOn(db, 'select').mockImplementation(((fields: any) => {
      if (fields?.count) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 2 }]), // Quota exhausted
          }),
        } as any;
      }
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              if (fields?.slug) return Promise.resolve([validChallenge]);
              if (fields?.containerName || fields?.challengeId) return Promise.resolve([]);
              if (fields?.status && !fields?.slug) return Promise.resolve([validTeam]);
              return Promise.resolve([]);
            }),
          }),
        }),
      } as any;
    }) as any);

    await expect(
      service.startInstance({
        slug: 'intro-sqli-sandbox',
        userId: 'u-1',
        teamId: validTeam.id,
        ipAddress: '127.0.0.1',
      })
    ).rejects.toThrow('TEAM_INSTANCE_LIMIT_EXCEEDED');
  });
});
