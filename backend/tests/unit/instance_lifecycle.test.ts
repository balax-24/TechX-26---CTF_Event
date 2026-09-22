import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DynamicChallengesService } from '../../src/modules/dynamic_challenges/dynamic_challenges.service.js';
import { setDockerManager, MockDockerManager } from '../../src/modules/dynamic_challenges/docker.manager.js';
import { db } from '../../src/db/index.js';
import { competitionService } from '../../src/modules/competition/competition.service.js';
import { auditService } from '../../src/modules/admin/audit.service.js';

describe('Stage 8: Dynamic Challenge Lifecycle & State Machine Transitions', () => {
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

  it('transitions state NONE -> CREATING -> RUNNING on successful start', async () => {
    let capturedValues: any = null;
    let updatedStatus: any = null;

    vi.spyOn(db, 'select').mockImplementation(((fields: any) => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => {
            if (fields?.slug) return Promise.resolve([validChallenge]);
            if (fields?.containerName || fields?.challengeId) return Promise.resolve([]);
            if (fields?.status && !fields?.slug) return Promise.resolve([validTeam]);
            if (fields?.count) return Promise.resolve([{ count: 0 }]);
            return Promise.resolve([]);
          }),
        }),
      }),
    })) as any);

    vi.spyOn(db, 'insert').mockImplementation((() => ({
      values: vi.fn().mockImplementation((val) => {
        capturedValues = val;
        return {
          returning: vi.fn().mockResolvedValue([
            {
              ...val,
              createdAt: new Date(),
            },
          ]),
        };
      }),
    })) as any);

    vi.spyOn(db, 'update').mockImplementation((() => ({
      set: vi.fn().mockImplementation((updateVal) => {
        updatedStatus = updateVal;
        return {
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                ...capturedValues,
                ...updateVal,
                createdAt: new Date(),
              },
            ]),
          }),
        };
      }),
    })) as any);

    const summary = await service.startInstance({
      slug: 'intro-sqli-sandbox',
      userId: 'u1111111-1111-4111-8111-111111111111',
      teamId: validTeam.id,
      ipAddress: '127.0.0.1',
    });

    expect(capturedValues.status).toBe('CREATING');
    expect(updatedStatus.status).toBe('RUNNING');
    expect(summary.status).toBe('RUNNING');
    expect(summary.connectionUrl).toBe('/api/v1/challenges/intro-sqli-sandbox/instance/proxy/');
    expect(summary.remainingTtlSeconds).toBeGreaterThan(0);
    expect(mockDocker.containers.size).toBe(1);
  });

  it('transitions state to FAILED and cleans up container when health check fails', async () => {
    mockDocker.shouldFailHealth = true;
    let failedStatus: any = null;

    vi.spyOn(db, 'select').mockImplementation(((fields: any) => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => {
            if (fields?.slug) return Promise.resolve([validChallenge]);
            if (fields?.containerName || fields?.challengeId) return Promise.resolve([]);
            if (fields?.status && !fields?.slug) return Promise.resolve([validTeam]);
            if (fields?.count) return Promise.resolve([{ count: 0 }]);
            return Promise.resolve([]);
          }),
        }),
      }),
    })) as any);

    vi.spyOn(db, 'insert').mockImplementation((() => ({
      values: vi.fn().mockImplementation((val) => ({
        returning: vi.fn().mockResolvedValue([{ ...val, createdAt: new Date() }]),
      })),
    })) as any);

    vi.spyOn(db, 'update').mockImplementation((() => ({
      set: vi.fn().mockImplementation((updateVal) => {
        failedStatus = updateVal;
        return {
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        };
      }),
    })) as any);

    await expect(
      service.startInstance({
        slug: 'intro-sqli-sandbox',
        userId: 'u1111111-1111-4111-8111-111111111111',
        teamId: validTeam.id,
        ipAddress: '127.0.0.1',
      })
    ).rejects.toThrow('INSTANCE_START_FAILED');

    expect(failedStatus.status).toBe('FAILED');
    expect(failedStatus.failureReason).toBe('HEALTH_CHECK_TIMEOUT');
    expect(mockDocker.containers.size).toBe(0); // Cleaned up
  });

  it('stops an active instance cleanly and transitions state to STOPPED', async () => {
    let finalStatus: any = null;

    vi.spyOn(db, 'select').mockImplementation(((fields: any) => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => {
            if (fields?.id && fields?.slug) return Promise.resolve([validChallenge]);
            return Promise.resolve([
              {
                id: 'inst-1',
                challengeId: validChallenge.id,
                teamId: validTeam.id,
                status: 'RUNNING',
                containerId: 'mock-container-1-xyz',
                expiresAt: new Date(Date.now() + 60000),
              },
            ]);
          }),
        }),
      }),
    })) as any);

    vi.spyOn(db, 'update').mockImplementation((() => ({
      set: vi.fn().mockImplementation((val) => {
        finalStatus = val;
        return {
          where: vi.fn().mockReturnValue({}),
        };
      }),
    })) as any);

    await service.stopInstance({
      slug: 'intro-sqli-sandbox',
      userId: 'u-1',
      teamId: validTeam.id,
      ipAddress: '127.0.0.1',
    });

    expect(finalStatus.status).toBe('STOPPED');
    expect(finalStatus.stoppedAt).toBeInstanceOf(Date);
  });

  it('resets an instance by stopping old container and spawning a fresh container', async () => {
    let startCalled = false;
    vi.spyOn(service, 'startInstance').mockImplementation(async () => {
      startCalled = true;
      return {
        id: 'new-inst',
        challengeId: validChallenge.id,
        challengeSlug: validChallenge.slug,
        status: 'RUNNING',
        connectionUrl: '/api/v1/challenges/intro-sqli-sandbox/instance/proxy/',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 1800000).toISOString(),
        remainingTtlSeconds: 1800,
      };
    });

    vi.spyOn(db, 'select').mockImplementation(((fields: any) => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => {
            if (fields?.id && fields?.slug) return Promise.resolve([validChallenge]);
            return Promise.resolve([
              {
                id: 'old-inst',
                challengeId: validChallenge.id,
                teamId: validTeam.id,
                status: 'RUNNING',
                containerId: 'mock-old-container',
              },
            ]);
          }),
        }),
      }),
    })) as any);

    vi.spyOn(db, 'update').mockImplementation((() => ({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({}),
      }),
    })) as any);

    const result = await service.resetInstance({
      slug: 'intro-sqli-sandbox',
      userId: 'u-1',
      teamId: validTeam.id,
      ipAddress: '127.0.0.1',
    });

    expect(startCalled).toBe(true);
    expect(result.id).toBe('new-inst');
  });
});
