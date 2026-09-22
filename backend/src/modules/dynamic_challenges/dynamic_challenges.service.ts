import { eq, and, inArray, count, desc, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { challenges, challengeInstances, teams, ChallengeInstance } from '../../db/schema.js';
import { competitionService } from '../competition/competition.service.js';
import { auditService } from '../admin/audit.service.js';
import { dynamicChallengeRegistry } from './dynamic_challenges.registry.js';
import { getDockerManager } from './docker.manager.js';
import { InstanceSummary, DockerContainerResult } from './dynamic_challenges.types.js';
import { randomUUID, randomBytes } from 'crypto';
import { logger } from '../../utils/logger.js';

export class DynamicChallengesService {
  public MAX_INSTANCES_PER_TEAM = 2;
  public MAX_GLOBAL_INSTANCES = 100;

  /**
   * Spawns or returns existing active dynamic challenge instance.
   * Fully idempotent: duplicate requests safely return the current instance.
   */
  async startInstance(params: {
    slug: string;
    userId: string;
    teamId: string;
    ipAddress: string;
    isAdmin?: boolean;
  }): Promise<InstanceSummary> {
    const { slug, userId, teamId, ipAddress, isAdmin = false } = params;

    // 1. Participant vs Admin boundary
    if (isAdmin) {
      throw new Error('ADMIN_PARTICIPATION_FORBIDDEN');
    }

    // 2. Authoritative Competition State Gate
    await competitionService.requireLiveCompetition();

    // 3. Team Status Gate (Must be active; rejects disqualified and disabled)
    const [team] = await db
      .select({ id: teams.id, status: teams.status })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    if (!team) {
      throw new Error('TEAM_NOT_FOUND');
    }
    if (team.status === 'disqualified') {
      throw new Error('TEAM_DISQUALIFIED');
    }
    if (team.status !== 'active') {
      throw new Error('TEAM_DISABLED');
    }

    // 4. Challenge Verification & Release Gate
    const [challenge] = await db
      .select({
        id: challenges.id,
        slug: challenges.slug,
        status: challenges.status,
        releaseTime: challenges.releaseTime,
      })
      .from(challenges)
      .where(eq(challenges.slug, slug))
      .limit(1);

    if (!challenge || challenge.status !== 'published') {
      throw new Error('CHALLENGE_NOT_FOUND');
    }
    if (challenge.releaseTime && new Date(challenge.releaseTime) > new Date()) {
      throw new Error('CHALLENGE_NOT_RELEASED');
    }

    // 5. Server-Authoritative Registry Verification
    const def =
      dynamicChallengeRegistry.getDefinition(challenge.id) ||
      dynamicChallengeRegistry.getDefinition(challenge.slug);

    if (!def) {
      throw new Error('CHALLENGE_NOT_DYNAMIC');
    }

    // 6. Idempotency Check: Existing Active Instance for this Team + Challenge
    const [existing] = await db
      .select({
        id: challengeInstances.id,
        challengeId: challengeInstances.challengeId,
        teamId: challengeInstances.teamId,
        status: challengeInstances.status,
        containerId: challengeInstances.containerId,
        containerName: challengeInstances.containerName,
        internalIp: challengeInstances.internalIp,
        internalPort: challengeInstances.internalPort,
        createdAt: challengeInstances.createdAt,
        expiresAt: challengeInstances.expiresAt,
        failureReason: challengeInstances.failureReason,
      })
      .from(challengeInstances)
      .where(
        and(
          eq(challengeInstances.teamId, teamId),
          eq(challengeInstances.challengeId, challenge.id),
          inArray(challengeInstances.status, ['CREATING', 'RUNNING'])
        )
      )
      .limit(1);

    if (existing) {
      if (new Date(existing.expiresAt) <= new Date()) {
        await this.expireInstance(existing.id);
      } else {
        return this.formatInstanceSummary(existing, challenge.slug);
      }
    }

    // 7. Team Concurrency Cap
    const activeTeamCount = await db
      .select({ count: count() })
      .from(challengeInstances)
      .where(
        and(
          eq(challengeInstances.teamId, teamId),
          inArray(challengeInstances.status, ['CREATING', 'RUNNING'])
        )
      );

    if (Number(activeTeamCount[0]?.count || 0) >= this.MAX_INSTANCES_PER_TEAM) {
      throw new Error('TEAM_INSTANCE_LIMIT_EXCEEDED');
    }

    // 8. Global Platform Capacity Cap
    const globalCount = await db
      .select({ count: count() })
      .from(challengeInstances)
      .where(inArray(challengeInstances.status, ['CREATING', 'RUNNING']));

    if (Number(globalCount[0]?.count || 0) >= this.MAX_GLOBAL_INSTANCES) {
      throw new Error('CHALLENGE_CAPACITY_EXCEEDED');
    }

    // 9. Allocate Identifiers & TTL
    const instanceId = randomUUID();
    const containerName = `techx26-inst-${instanceId.substring(0, 8)}-${Math.random().toString(36).substring(2, 6)}`;
    const accessToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + def.ttlSeconds * 1000);

    // Insert CREATING state record
    const [createdInstance] = await db
      .insert(challengeInstances)
      .values({
        id: instanceId,
        challengeId: challenge.id,
        teamId,
        userId,
        status: 'CREATING',
        containerName,
        internalPort: def.internalPort,
        accessToken,
        expiresAt,
        instanceMetadata: {
          slug: challenge.slug,
          image: def.image,
          ttlSeconds: def.ttlSeconds,
        },
      })
      .returning();

    await auditService.record({
      actorId: userId,
      actorRole: 'participant',
      actorIp: ipAddress,
      action: 'challenge_instance_created',
      entityType: 'challenge_instance',
      entityId: instanceId,
      newState: { status: 'CREATING', challengeId: challenge.id, teamId },
      detailsJson: { slug: challenge.slug },
    });

    // 10. Container Creation via Hardened Docker Manager
    const dockerManager = getDockerManager();
    let containerResult: DockerContainerResult;

    try {
      containerResult = await dockerManager.createAndStartContainer({
        containerName,
        image: def.image,
        networkName: 'techx_ctf_challenges_net',
        internalPort: def.internalPort,
        memoryLimitBytes: def.memoryLimitBytes,
        cpuLimitNano: def.cpuLimitNano,
        pidsLimit: def.pidsLimit,
        readOnlyRootfs: def.readOnlyRootfs,
        tmpfsMounts: def.tmpfsMounts,
        env: {
          ...(def.envAllowlist || {}),
          CHALLENGE_INSTANCE_ID: instanceId,
          CHALLENGE_PORT: String(def.internalPort),
        },
        labels: {
          'techx.managed': 'true',
          'techx.component': 'ctf-challenge',
          'techx.instance_id': instanceId,
          'techx.challenge_id': challenge.id,
          'techx.team_id': teamId,
        },
      });
    } catch (err: any) {
      logger.error({ err: err.message, instanceId, teamId }, 'Docker container creation failed');

      await db
        .update(challengeInstances)
        .set({
          status: 'FAILED',
          failureReason: 'CONTAINER_STARTUP_ERROR',
          stoppedAt: new Date(),
        })
        .where(eq(challengeInstances.id, instanceId));

      await auditService.record({
        actorId: userId,
        actorRole: 'participant',
        actorIp: ipAddress,
        action: 'challenge_instance_failed',
        entityType: 'challenge_instance',
        entityId: instanceId,
        reason: 'Container startup error',
        detailsJson: { challengeId: challenge.id, teamId, error: err.message },
      });

      throw new Error('INSTANCE_START_FAILED');
    }

    // 11. Bounded Health Check Verification
    let healthy = false;
    for (let i = 0; i < 5; i++) {
      healthy = await dockerManager.healthCheck(
        containerResult.internalIp,
        containerResult.internalPort,
        def.healthCheckPath || '/'
      );
      if (healthy) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    if (!healthy) {
      await dockerManager.stopAndRemoveContainer(containerResult.containerId).catch(() => {});

      await db
        .update(challengeInstances)
        .set({
          status: 'FAILED',
          failureReason: 'HEALTH_CHECK_TIMEOUT',
          stoppedAt: new Date(),
        })
        .where(eq(challengeInstances.id, instanceId));

      await auditService.record({
        actorId: userId,
        actorRole: 'participant',
        actorIp: ipAddress,
        action: 'challenge_instance_failed',
        entityType: 'challenge_instance',
        entityId: instanceId,
        reason: 'Health check failed',
        detailsJson: { challengeId: challenge.id, teamId },
      });

      throw new Error('INSTANCE_START_FAILED');
    }

    // 12. Transition to RUNNING state
    const [runningInstance] = await db
      .update(challengeInstances)
      .set({
        status: 'RUNNING',
        containerId: containerResult.containerId,
        internalIp: containerResult.internalIp,
        startedAt: new Date(),
        lastSeenAt: new Date(),
      })
      .where(eq(challengeInstances.id, instanceId))
      .returning();

    await auditService.record({
      actorId: userId,
      actorRole: 'participant',
      actorIp: ipAddress,
      action: 'challenge_instance_started',
      entityType: 'challenge_instance',
      entityId: instanceId,
      newState: { status: 'RUNNING', containerId: containerResult.containerId },
      detailsJson: { challengeId: challenge.id, teamId },
    });

    return this.formatInstanceSummary(runningInstance, challenge.slug);
  }

  /**
   * Retrieves active instance status for the calling team.
   */
  async getInstanceStatus(params: {
    slug: string;
    teamId: string;
  }): Promise<InstanceSummary | null> {
    const { slug, teamId } = params;

    const [challenge] = await db
      .select({ id: challenges.id, slug: challenges.slug })
      .from(challenges)
      .where(eq(challenges.slug, slug))
      .limit(1);

    if (!challenge) {
      throw new Error('CHALLENGE_NOT_FOUND');
    }

    const [instance] = await db
      .select()
      .from(challengeInstances)
      .where(
        and(
          eq(challengeInstances.teamId, teamId),
          eq(challengeInstances.challengeId, challenge.id),
          inArray(challengeInstances.status, ['CREATING', 'RUNNING'])
        )
      )
      .limit(1);

    if (!instance) {
      return null;
    }

    // Check expiration
    if (new Date(instance.expiresAt) <= new Date()) {
      await this.expireInstance(instance.id);
      return null;
    }

    // Touch lastSeenAt
    await db
      .update(challengeInstances)
      .set({ lastSeenAt: new Date() })
      .where(eq(challengeInstances.id, instance.id));

    return this.formatInstanceSummary(instance, challenge.slug);
  }

  /**
   * Stops and destroys an active challenge instance.
   */
  async stopInstance(params: {
    slug: string;
    userId: string;
    teamId: string;
    ipAddress: string;
  }): Promise<void> {
    const { slug, userId, teamId, ipAddress } = params;

    const [challenge] = await db
      .select({ id: challenges.id, slug: challenges.slug })
      .from(challenges)
      .where(eq(challenges.slug, slug))
      .limit(1);

    if (!challenge) {
      throw new Error('CHALLENGE_NOT_FOUND');
    }

    const [instance] = await db
      .select()
      .from(challengeInstances)
      .where(
        and(
          eq(challengeInstances.teamId, teamId),
          eq(challengeInstances.challengeId, challenge.id),
          inArray(challengeInstances.status, ['CREATING', 'RUNNING'])
        )
      )
      .limit(1);

    if (!instance) {
      throw new Error('INSTANCE_NOT_FOUND');
    }

    await db
      .update(challengeInstances)
      .set({ status: 'STOPPING' })
      .where(eq(challengeInstances.id, instance.id));

    if (instance.containerId) {
      await getDockerManager().stopAndRemoveContainer(instance.containerId).catch((err) => {
        logger.warn({ err: err.message, containerId: instance.containerId }, 'Error stopping container');
      });
    }

    await db
      .update(challengeInstances)
      .set({
        status: 'STOPPED',
        stoppedAt: new Date(),
      })
      .where(eq(challengeInstances.id, instance.id));

    await auditService.record({
      actorId: userId,
      actorRole: 'participant',
      actorIp: ipAddress,
      action: 'challenge_instance_stopped',
      entityType: 'challenge_instance',
      entityId: instance.id,
      newState: { status: 'STOPPED' },
      detailsJson: { challengeId: challenge.id, teamId },
    });
  }

  /**
   * Cleanly terminates the old instance and spins up a fresh container.
   */
  async resetInstance(params: {
    slug: string;
    userId: string;
    teamId: string;
    ipAddress: string;
    isAdmin?: boolean;
  }): Promise<InstanceSummary> {
    const { slug, userId, teamId, ipAddress, isAdmin = false } = params;

    const [challenge] = await db
      .select({ id: challenges.id, slug: challenges.slug })
      .from(challenges)
      .where(eq(challenges.slug, slug))
      .limit(1);

    if (!challenge) {
      throw new Error('CHALLENGE_NOT_FOUND');
    }

    // Stop existing instance if active
    const [existing] = await db
      .select()
      .from(challengeInstances)
      .where(
        and(
          eq(challengeInstances.teamId, teamId),
          eq(challengeInstances.challengeId, challenge.id),
          inArray(challengeInstances.status, ['CREATING', 'RUNNING'])
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(challengeInstances)
        .set({ status: 'STOPPING' })
        .where(eq(challengeInstances.id, existing.id));

      if (existing.containerId) {
        await getDockerManager().stopAndRemoveContainer(existing.containerId).catch(() => {});
      }

      await db
        .update(challengeInstances)
        .set({ status: 'STOPPED', stoppedAt: new Date() })
        .where(eq(challengeInstances.id, existing.id));

      await auditService.record({
        actorId: userId,
        actorRole: 'participant',
        actorIp: ipAddress,
        action: 'challenge_instance_reset',
        entityType: 'challenge_instance',
        entityId: existing.id,
        detailsJson: { challengeId: challenge.id, teamId },
      });
    }

    // Spin up fresh replacement
    return await this.startInstance({ slug, userId, teamId, ipAddress, isAdmin });
  }

  /**
   * Resolves upstream proxy target strictly from database record for authenticated team.
   * Zero arbitrary upstream proxying permitted (SSRF immune).
   */
  async getProxyTarget(params: {
    slug: string;
    teamId: string;
  }): Promise<{ internalIp: string; internalPort: number }> {
    const { slug, teamId } = params;

    const [challenge] = await db
      .select({ id: challenges.id })
      .from(challenges)
      .where(eq(challenges.slug, slug))
      .limit(1);

    if (!challenge) {
      throw new Error('CHALLENGE_NOT_FOUND');
    }

    const [instance] = await db
      .select()
      .from(challengeInstances)
      .where(
        and(
          eq(challengeInstances.teamId, teamId),
          eq(challengeInstances.challengeId, challenge.id),
          eq(challengeInstances.status, 'RUNNING')
        )
      )
      .limit(1);

    if (!instance || !instance.internalIp) {
      throw new Error('INSTANCE_NOT_RUNNING');
    }

    if (new Date(instance.expiresAt) <= new Date()) {
      await this.expireInstance(instance.id);
      throw new Error('INSTANCE_EXPIRED');
    }

    return {
      internalIp: instance.internalIp,
      internalPort: instance.internalPort,
    };
  }

  /**
   * Transitions an instance to EXPIRED and cleans up associated container.
   */
  public async expireInstance(instanceId: string): Promise<void> {
    const [instance] = await db
      .select()
      .from(challengeInstances)
      .where(eq(challengeInstances.id, instanceId))
      .limit(1);

    if (!instance) return;

    await db
      .update(challengeInstances)
      .set({ status: 'STOPPING' })
      .where(eq(challengeInstances.id, instanceId));

    if (instance.containerId) {
      await getDockerManager().stopAndRemoveContainer(instance.containerId).catch(() => {});
    }

    await db
      .update(challengeInstances)
      .set({
        status: 'EXPIRED',
        stoppedAt: new Date(),
      })
      .where(eq(challengeInstances.id, instanceId));

    await auditService.record({
      actorId: instance.userId,
      actorRole: 'system',
      actorIp: '127.0.0.1',
      action: 'challenge_instance_expired',
      entityType: 'challenge_instance',
      entityId: instance.id,
      newState: { status: 'EXPIRED' },
      detailsJson: { challengeId: instance.challengeId, teamId: instance.teamId },
    });
  }

  private formatInstanceSummary(
    instance: any,
    challengeSlug: string
  ): InstanceSummary {
    const now = Date.now();
    const expiresDate = instance.expiresAt ? new Date(instance.expiresAt) : new Date(now + 1800000);
    const expiresMs = expiresDate.getTime();
    const remainingSeconds = Math.max(0, Math.floor((expiresMs - now) / 1000));
    const createdDate = instance.createdAt ? new Date(instance.createdAt) : new Date(now);

    return {
      id: instance.id,
      challengeId: instance.challengeId,
      challengeSlug,
      status: instance.status as any,
      connectionUrl: `/api/v1/challenges/${challengeSlug}/instance/proxy/`,
      createdAt: createdDate.toISOString(),
      expiresAt: expiresDate.toISOString(),
      remainingTtlSeconds: remainingSeconds,
      failureReason: instance.failureReason,
    };
  }

}

export const dynamicChallengesService = new DynamicChallengesService();
