import { describe, it, expect, vi, beforeEach } from 'vitest';
import { instanceCleanupWorker } from '../../src/modules/dynamic_challenges/cleanup.worker.js';
import { setDockerManager, MockDockerManager } from '../../src/modules/dynamic_challenges/docker.manager.js';
import { db } from '../../src/db/index.js';
import { auditService } from '../../src/modules/admin/audit.service.js';

describe('Stage 8: Container Orphan Reaper & Crash Recovery Reconciliation', () => {
  let mockDocker: MockDockerManager;

  beforeEach(() => {
    mockDocker = new MockDockerManager();
    setDockerManager(mockDocker);
    vi.restoreAllMocks();

    vi.spyOn(auditService, 'record').mockResolvedValue(undefined);
  });

  it('reaps orphaned Docker containers that possess techx.managed label but have no DB ownership', async () => {
    // Container in Docker with no matching DB record
    await mockDocker.createAndStartContainer({
      containerName: 'techx26-inst-orphan-999',
      image: 'techx/test:latest',
      networkName: 'techx_ctf_challenges_net',
      internalPort: 8080,
      memoryLimitBytes: 256 * 1024 * 1024,
      cpuLimitNano: 500_000_000,
      pidsLimit: 64,
      readOnlyRootfs: true,
      tmpfsMounts: {},
      env: {},
      labels: {
        'techx.managed': 'true',
        'techx.instance_id': 'inst-orphan-999',
      },
    });

    expect(mockDocker.containers.size).toBe(1);

    // DB returns 0 active instances
    vi.spyOn(db, 'select').mockImplementation((() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    })) as any);

    const auditSpy = vi.spyOn(auditService, 'record');

    const result = await instanceCleanupWorker.reconcile();

    expect(result.orphansReaped).toBe(1);
    expect(mockDocker.containers.size).toBe(0); // Container reaped
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'challenge_instance_orphan_reaped',
      })
    );
  });

  it('detects externally crashed or killed containers and transitions DB state to FAILED', async () => {
    // Container created but state changed to exited
    const containerResult = await mockDocker.createAndStartContainer({
      containerName: 'techx26-inst-crashed-1',
      image: 'techx/test:latest',
      networkName: 'techx_ctf_challenges_net',
      internalPort: 8080,
      memoryLimitBytes: 256 * 1024 * 1024,
      cpuLimitNano: 500_000_000,
      pidsLimit: 64,
      readOnlyRootfs: true,
      tmpfsMounts: {},
      env: {},
      labels: {
        'techx.managed': 'true',
        'techx.instance_id': 'inst-crashed-1',
      },
    });

    // Simulate crash/SIGKILL
    const c = mockDocker.containers.get(containerResult.containerId)!;
    c.state = 'exited';

    // DB says instance is RUNNING
    vi.spyOn(db, 'select').mockImplementation(((fields: any) => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          if (fields?.id && !fields?.containerId) return Promise.resolve([]); // No TTL expired
          return Promise.resolve([
            {
              id: 'inst-crashed-1',
              challengeId: 'c1111111-1111-4111-8111-111111111111',
              teamId: 't1111111-1111-4111-8111-111111111111',
              status: 'RUNNING',
              containerId: containerResult.containerId,
            },
          ]);
        }),
      }),
    })) as any);

    let failedUpdate: any = null;
    vi.spyOn(db, 'update').mockImplementation((() => ({
      set: vi.fn().mockImplementation((val) => {
        failedUpdate = val;
        return {
          where: vi.fn().mockReturnValue({}),
        };
      }),
    })) as any);

    const auditSpy = vi.spyOn(auditService, 'record');

    const result = await instanceCleanupWorker.reconcile();

    expect(result.crashesReconciled).toBe(1);
    expect(failedUpdate.status).toBe('FAILED');
    expect(failedUpdate.failureReason).toBe('CONTAINER_TERMINATED_EXTERNALLY');
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'challenge_instance_failed',
        reason: 'Container terminated externally',
      })
    );
  });
});
