import { and, inArray, lte, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { challengeInstances } from '../../db/schema.js';
import { getDockerManager } from './docker.manager.js';
import { dynamicChallengesService } from './dynamic_challenges.service.js';
import { auditService } from '../admin/audit.service.js';
import { logger } from '../../utils/logger.js';

export class InstanceCleanupWorker {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private intervalMs = 15000; // 15 seconds

  public start(): void {
    if (this.timer) return;
    logger.info('Starting Dynamic Challenge Instance Cleanup Worker...');
    // Run an initial reconciliation scan on startup
    this.reconcile().catch((err) => {
      logger.error({ err: err.message }, 'Startup container reconciliation error');
    });

    this.timer = setInterval(() => {
      this.reconcile().catch((err) => {
        logger.error({ err: err.message }, 'Periodic container reconciliation error');
      });
    }, this.intervalMs);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('Dynamic Challenge Instance Cleanup Worker stopped');
    }
  }

  /**
   * Main reconciliation routine:
   * 1. Reaps TTL-expired instances
   * 2. Reaps orphaned Docker containers (containers without active DB record)
   * 3. Reconciles crashed Docker containers (DB says RUNNING but container is dead)
   */
  public async reconcile(): Promise<{
    expiredCount: number;
    orphansReaped: number;
    crashesReconciled: number;
  }> {
    if (this.isRunning) {
      return { expiredCount: 0, orphansReaped: 0, crashesReconciled: 0 };
    }
    this.isRunning = true;

    let expiredCount = 0;
    let orphansReaped = 0;
    let crashesReconciled = 0;

    try {
      // -----------------------------------------------------------------------
      // 1. REAP TTL-EXPIRED INSTANCES
      // -----------------------------------------------------------------------
      const expiredInstances = await db
        .select({ id: challengeInstances.id })
        .from(challengeInstances)
        .where(
          and(
            inArray(challengeInstances.status, ['CREATING', 'RUNNING']),
            lte(challengeInstances.expiresAt, new Date())
          )
        );

      for (const inst of expiredInstances) {
        try {
          await dynamicChallengesService.expireInstance(inst.id);
          expiredCount++;
        } catch (err: any) {
          logger.warn({ err: err.message, instanceId: inst.id }, 'Failed to expire instance');
        }
      }

      // -----------------------------------------------------------------------
      // 2. ORPHAN REAPER & CRASH RECONCILIATION
      // -----------------------------------------------------------------------
      const dockerManager = getDockerManager();
      const managedContainers = await dockerManager.listManagedContainers().catch(() => []);

      // Fetch all active instances in DB
      const activeDbInstances = await db
        .select()
        .from(challengeInstances)
        .where(inArray(challengeInstances.status, ['CREATING', 'RUNNING']));

      const activeInstanceIdMap = new Map(activeDbInstances.map((i) => [i.id, i]));
      const activeContainerIdMap = new Map(
        activeDbInstances.filter((i) => i.containerId).map((i) => [i.containerId!, i])
      );

      // 2a. Find Docker containers with no matching active DB instance (orphans)
      for (const container of managedContainers) {
        const instIdLabel = container.labels['techx.instance_id'];
        const matchesDb =
          activeContainerIdMap.has(container.containerId) ||
          (instIdLabel && activeInstanceIdMap.has(instIdLabel));

        if (!matchesDb) {
          logger.warn(
            { containerId: container.containerId, name: container.containerName },
            'Reaping orphaned Docker container'
          );
          await dockerManager.stopAndRemoveContainer(container.containerId).catch(() => {});
          orphansReaped++;

          await auditService.record({
            actorRole: 'system',
            actorIp: '127.0.0.1',
            action: 'challenge_instance_orphan_reaped',
            entityType: 'docker_container',
            entityId: container.containerId,
            detailsJson: { containerName: container.containerName, labels: container.labels },
          });
        }
      }

      // 2b. Find DB instances marked RUNNING whose Docker container died or disappeared
      for (const dbInst of activeDbInstances) {
        if (dbInst.status === 'RUNNING' && dbInst.containerId) {
          const inspected = await dockerManager.inspectContainer(dbInst.containerId);
          if (!inspected || inspected.state === 'exited' || inspected.state === 'dead') {
            logger.warn(
              { instanceId: dbInst.id, containerId: dbInst.containerId },
              'Reconciling externally terminated or crashed challenge container'
            );

            await db
              .update(challengeInstances)
              .set({
                status: 'FAILED',
                failureReason: 'CONTAINER_TERMINATED_EXTERNALLY',
                stoppedAt: new Date(),
              })
              .where(eq(challengeInstances.id, dbInst.id));

            crashesReconciled++;

            await auditService.record({
              actorRole: 'system',
              actorIp: '127.0.0.1',
              action: 'challenge_instance_failed',
              entityType: 'challenge_instance',
              entityId: dbInst.id,
              reason: 'Container terminated externally',
              detailsJson: { containerId: dbInst.containerId },
            });
          }
        }
      }
    } catch (err: any) {
      logger.error({ err: err.message }, 'Error in container reconciliation cycle');
    } finally {
      this.isRunning = false;
    }

    return { expiredCount, orphansReaped, crashesReconciled };
  }
}

export const instanceCleanupWorker = new InstanceCleanupWorker();
