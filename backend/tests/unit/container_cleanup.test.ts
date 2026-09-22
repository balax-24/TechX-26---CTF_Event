import { describe, it, expect, vi, beforeEach } from 'vitest';
import { instanceCleanupWorker } from '../../src/modules/dynamic_challenges/cleanup.worker.js';
import { dynamicChallengesService } from '../../src/modules/dynamic_challenges/dynamic_challenges.service.js';
import { setDockerManager, MockDockerManager } from '../../src/modules/dynamic_challenges/docker.manager.js';
import { db } from '../../src/db/index.js';
import { auditService } from '../../src/modules/admin/audit.service.js';

describe('Stage 8: Container TTL Expiration & Lifecycle Cleanup Worker', () => {
  let mockDocker: MockDockerManager;

  beforeEach(() => {
    mockDocker = new MockDockerManager();
    setDockerManager(mockDocker);
    vi.restoreAllMocks();

    vi.spyOn(auditService, 'record').mockResolvedValue(undefined);
  });

  it('scans and expires instances past their TTL, stopping Docker containers and auditing', async () => {
    // Mock container running in Docker
    await mockDocker.createAndStartContainer({
      containerName: 'techx26-inst-expired-1',
      image: 'techx/test:latest',
      networkName: 'techx_ctf_challenges_net',
      internalPort: 8080,
      memoryLimitBytes: 256 * 1024 * 1024,
      cpuLimitNano: 500_000_000,
      pidsLimit: 64,
      readOnlyRootfs: true,
      tmpfsMounts: {},
      env: {},
      labels: { 'techx.managed': 'true', 'techx.instance_id': 'inst-expired-1' },
    });
    const [runningContainerId] = Array.from(mockDocker.containers.keys());

    // 1 expired instance in DB
    vi.spyOn(db, 'select').mockImplementation(((fields: any) => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          const getResult = () => {
            if (fields?.id && !fields?.containerId) {
              // Expired instance list
              return Promise.resolve([{ id: 'inst-expired-1' }]);
            }
            // Expire lookup
            return Promise.resolve([
              {
                id: 'inst-expired-1',
                challengeId: 'c1111111-1111-4111-8111-111111111111',
                teamId: 't1111111-1111-4111-8111-111111111111',
                userId: 'u1111111-1111-4111-8111-111111111111',
                containerId: runningContainerId,
                status: 'RUNNING',
                expiresAt: new Date(Date.now() - 10000), // Expired 10s ago
              },
            ]);
          };
          const p = getResult();
          (p as any).limit = vi.fn().mockReturnValue(p);
          return p;
        }),
      }),
    })) as any);

    let expiredUpdateCalled = false;
    vi.spyOn(db, 'update').mockImplementation((() => ({
      set: vi.fn().mockImplementation((val) => {
        if (val.status === 'EXPIRED') expiredUpdateCalled = true;
        return {
          where: vi.fn().mockReturnValue({}),
        };
      }),
    })) as any);

    const auditSpy = vi.spyOn(auditService, 'record');

    const result = await instanceCleanupWorker.reconcile();

    expect(result.expiredCount).toBe(1);
    expect(expiredUpdateCalled).toBe(true);
    expect(mockDocker.containers.size).toBe(0); // Container was stopped & removed
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'challenge_instance_expired',
        entityId: 'inst-expired-1',
      })
    );
  });

  it('safely handles double-cleanup race condition without throwing', async () => {
    // When instance no longer exists or already expired
    vi.spyOn(db, 'select').mockImplementation((() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]), // No expired instances found
      }),
    })) as any);

    const result = await instanceCleanupWorker.reconcile();
    expect(result.expiredCount).toBe(0);
  });
});
