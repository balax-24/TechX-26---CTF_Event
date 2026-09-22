import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DynamicChallengesService, dynamicChallengesService } from '../../src/modules/dynamic_challenges/dynamic_challenges.service.js';
import { InstanceCleanupWorker } from '../../src/modules/dynamic_challenges/cleanup.worker.js';
import { setDockerManager, MockDockerManager } from '../../src/modules/dynamic_challenges/docker.manager.js';
import { db } from '../../src/db/index.js';
import { challenges, challengeInstances, teams } from '../../src/db/schema.js';
import { competitionService } from '../../src/modules/competition/competition.service.js';
import { auditService } from '../../src/modules/admin/audit.service.js';

describe('Stage 8 Hardening: Competition-End Lifecycle and Cleanup', () => {
  let service: DynamicChallengesService;
  let mockDocker: MockDockerManager;
  let worker: InstanceCleanupWorker;

  const validChallenge = {
    id: 'c2222222-2222-4222-8222-222222222222',
    slug: 'intro-sqli-sandbox',
    status: 'published',
    releaseTime: null,
  };

  const validTeam = {
    id: 't2222222-2222-4222-8222-222222222222',
    status: 'active',
  };

  beforeEach(() => {
    service = new DynamicChallengesService();
    mockDocker = new MockDockerManager();
    setDockerManager(mockDocker);
    worker = new InstanceCleanupWorker();
    vi.restoreAllMocks();

    vi.spyOn(auditService, 'record').mockResolvedValue(undefined);
  });

  // ---------------------------------------------------------------------------
  // 1. NEW INSTANCE CREATION AND RESET BLOCKED ON COMPETITION END
  // ---------------------------------------------------------------------------
  it('blocks new instance creation when competition is ended', async () => {
    vi.spyOn(competitionService, 'requireLiveCompetition').mockRejectedValue(
      new Error('COMPETITION_NOT_ACTIVE')
    );

    await expect(
      service.startInstance({
        slug: 'intro-sqli-sandbox',
        userId: 'u-1',
        teamId: validTeam.id,
        ipAddress: '127.0.0.1',
      })
    ).rejects.toThrow('COMPETITION_NOT_ACTIVE');
  });

  it('blocks instance reset when competition is ended', async () => {
    vi.spyOn(competitionService, 'requireLiveCompetition').mockRejectedValue(
      new Error('COMPETITION_NOT_ACTIVE')
    );

    await expect(
      service.resetInstance({
        slug: 'intro-sqli-sandbox',
        userId: 'u-1',
        teamId: validTeam.id,
        ipAddress: '127.0.0.1',
      })
    ).rejects.toThrow('COMPETITION_NOT_ACTIVE');
  });

  // ---------------------------------------------------------------------------
  // 2. PROXY ROUTING CUT OFF ON COMPETITION END
  // ---------------------------------------------------------------------------
  it('immediately denies proxy target resolution when competition transitions to ended', async () => {
    vi.spyOn(competitionService, 'requireLiveCompetition').mockRejectedValue(
      new Error('COMPETITION_NOT_ACTIVE')
    );

    await expect(
      service.getProxyTarget({
        instanceId: 'inst-12345678',
        accessToken: 'valid-token',
      })
    ).rejects.toThrow('COMPETITION_NOT_ACTIVE');
  });

  // ---------------------------------------------------------------------------
  // 3. CLEANUP WORKER TEARS DOWN ALL RUNNING CONTAINERS WHEN COMPETITION ENDS
  // ---------------------------------------------------------------------------
  it('cleanup worker expires all active instances and destroys containers when competition is ended', async () => {
    const activeInstances = [
      {
        id: 'inst-comp-end-1',
        containerId: 'docker-comp-1',
        containerName: 'techx26-inst-comp1',
        status: 'RUNNING',
        expiresAt: new Date(Date.now() + 3600000), // Not expired by time
      },
      {
        id: 'inst-comp-end-2',
        containerId: 'docker-comp-2',
        containerName: 'techx26-inst-comp2',
        status: 'RUNNING',
        expiresAt: new Date(Date.now() + 3600000), // Not expired by time
      },
    ];

    // Seed mock docker with these containers
    mockDocker.containers.set('docker-comp-1', {
      id: 'docker-comp-1',
      name: 'techx26-inst-comp1',
      status: 'running',
      labels: { 'techx.managed': 'true', 'techx.instance_id': 'inst-comp-end-1' },
      env: [],
      networkMode: 'techx-inst-net-inst-com',
      ports: {},
    });
    mockDocker.containers.set('docker-comp-2', {
      id: 'docker-comp-2',
      name: 'techx26-inst-comp2',
      status: 'running',
      labels: { 'techx.managed': 'true', 'techx.instance_id': 'inst-comp-end-2' },
      env: [],
      networkMode: 'techx-inst-net-inst-com',
      ports: {},
    });

    // Competition state is ENDED
    vi.spyOn(competitionService, 'getCompetitionState').mockResolvedValue({
      state: 'ended',
      startsAt: new Date(Date.now() - 7200000),
      endsAt: new Date(Date.now() - 1000),
      freezeAt: null,
      isFrozen: false,
    });

    const expireSpy = vi.spyOn(dynamicChallengesService, 'expireInstance').mockResolvedValue(undefined as any);

    // Mock DB query for active instances
    vi.spyOn(db, 'select').mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(activeInstances),
      }),
    } as any);

    const result = await worker.reconcile();

    // Verify both instances were expired
    expect(expireSpy).toHaveBeenCalledTimes(2);
    expect(expireSpy).toHaveBeenCalledWith('inst-comp-end-1');
    expect(expireSpy).toHaveBeenCalledWith('inst-comp-end-2');
    expect(result.expiredCount).toBe(2);
  });
});
