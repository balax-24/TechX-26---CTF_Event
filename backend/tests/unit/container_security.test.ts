import { describe, it, expect, beforeEach } from 'vitest';
import { dynamicChallengeRegistry } from '../../src/modules/dynamic_challenges/dynamic_challenges.registry.js';
import { MockDockerManager } from '../../src/modules/dynamic_challenges/docker.manager.js';

describe('Stage 8: Container Security Hardening & Isolation Baseline', () => {
  let mockDocker: MockDockerManager;

  beforeEach(() => {
    mockDocker = new MockDockerManager();
  });

  // ---------------------------------------------------------------------------
  // 1. DOCKER SECURITY FLAGS & RUNTIME CONTROLS
  // ---------------------------------------------------------------------------
  it('enforces mandatory finite memory, CPU, and PID limits on container creation', async () => {
    // Missing memory limit throws
    await expect(
      mockDocker.createAndStartContainer({
        containerName: 'test-inst-1',
        image: 'techx/test:latest',
        networkName: 'techx_ctf_challenges_net',
        internalPort: 8080,
        memoryLimitBytes: 0, // Unbounded memory
        cpuLimitNano: 500_000_000,
        pidsLimit: 64,
        readOnlyRootfs: true,
        tmpfsMounts: { '/tmp': 'rw,noexec,nosuid,size=32m' },
        env: {},
        labels: { 'techx.managed': 'true' },
      })
    ).rejects.toThrow('Security Error: Memory limit must be explicitly finite');

    // Missing PID limit throws
    await expect(
      mockDocker.createAndStartContainer({
        containerName: 'test-inst-2',
        image: 'techx/test:latest',
        networkName: 'techx_ctf_challenges_net',
        internalPort: 8080,
        memoryLimitBytes: 256 * 1024 * 1024,
        cpuLimitNano: 500_000_000,
        pidsLimit: 0, // Unbounded PIDs (fork bomb vulnerability)
        readOnlyRootfs: true,
        tmpfsMounts: { '/tmp': 'rw,noexec,nosuid,size=32m' },
        env: {},
        labels: { 'techx.managed': 'true' },
      })
    ).rejects.toThrow('Security Error: PIDs limit must be explicitly finite');
  });

  it('requires techx.managed label on all dynamic challenge containers', async () => {
    await expect(
      mockDocker.createAndStartContainer({
        containerName: 'test-inst-3',
        image: 'techx/test:latest',
        networkName: 'techx_ctf_challenges_net',
        internalPort: 8080,
        memoryLimitBytes: 256 * 1024 * 1024,
        cpuLimitNano: 500_000_000,
        pidsLimit: 64,
        readOnlyRootfs: true,
        tmpfsMounts: { '/tmp': 'rw,noexec,nosuid,size=32m' },
        env: {},
        labels: {}, // Missing label
      })
    ).rejects.toThrow('Security Error: Managed label is required');
  });

  // ---------------------------------------------------------------------------
  // 2. SERVER-AUTHORITATIVE MANIFEST VALIDATION
  // ---------------------------------------------------------------------------
  it('validates server registry: rejects definitions that exceed safe limits or leak platform secrets', () => {
    // Secret violation: passing JWT_SECRET
    expect(() => {
      dynamicChallengeRegistry.validateDefinition({
        challengeId: 'c-invalid-1',
        slug: 'invalid-secret-chal',
        image: 'techx/test:1.0',
        internalPort: 8080,
        memoryLimitBytes: 256 * 1024 * 1024,
        cpuLimitNano: 500_000_000,
        pidsLimit: 64,
        readOnlyRootfs: true,
        tmpfsMounts: {},
        ttlSeconds: 1800,
        envAllowlist: {
          JWT_SECRET: 'leaked_super_secret',
        },
      });
    }).toThrow('Security Violation: Disallowed platform secret key');

    // Secret violation: passing DATABASE_URL
    expect(() => {
      dynamicChallengeRegistry.validateDefinition({
        challengeId: 'c-invalid-2',
        slug: 'invalid-secret-chal-2',
        image: 'techx/test:1.0',
        internalPort: 8080,
        memoryLimitBytes: 256 * 1024 * 1024,
        cpuLimitNano: 500_000_000,
        pidsLimit: 64,
        readOnlyRootfs: true,
        tmpfsMounts: {},
        ttlSeconds: 1800,
        envAllowlist: {
          DATABASE_URL: 'postgres://root:pwd@db/ctf',
        },
      });
    }).toThrow('Security Violation: Disallowed platform secret key');

    // Resource violation: Memory too high (> 1024MB)
    expect(() => {
      dynamicChallengeRegistry.validateDefinition({
        challengeId: 'c-invalid-3',
        slug: 'invalid-mem-chal',
        image: 'techx/test:1.0',
        internalPort: 8080,
        memoryLimitBytes: 2048 * 1024 * 1024, // 2GB
        cpuLimitNano: 500_000_000,
        pidsLimit: 64,
        readOnlyRootfs: true,
        tmpfsMounts: {},
        ttlSeconds: 1800,
      });
    }).toThrow('memory limit');

    // Resource violation: CPU too high (> 2.0 vCPUs)
    expect(() => {
      dynamicChallengeRegistry.validateDefinition({
        challengeId: 'c-invalid-4',
        slug: 'invalid-cpu-chal',
        image: 'techx/test:1.0',
        internalPort: 8080,
        memoryLimitBytes: 256 * 1024 * 1024,
        cpuLimitNano: 4_000_000_000, // 4 vCPUs
        pidsLimit: 64,
        readOnlyRootfs: true,
        tmpfsMounts: {},
        ttlSeconds: 1800,
      });
    }).toThrow('CPU limit');

    // TTL violation: TTL > 7200s
    expect(() => {
      dynamicChallengeRegistry.validateDefinition({
        challengeId: 'c-invalid-5',
        slug: 'invalid-ttl-chal',
        image: 'techx/test:1.0',
        internalPort: 8080,
        memoryLimitBytes: 256 * 1024 * 1024,
        cpuLimitNano: 500_000_000,
        pidsLimit: 64,
        readOnlyRootfs: true,
        tmpfsMounts: {},
        ttlSeconds: 86400, // 24 hours
      });
    }).toThrow('ttlSeconds');
  });

  it('all pre-registered production challenge manifests satisfy security baselines', () => {
    const definitions = dynamicChallengeRegistry.getAllDefinitions();
    expect(definitions.length).toBeGreaterThanOrEqual(3);

    for (const def of definitions) {
      expect(def.memoryLimitBytes).toBeLessThanOrEqual(512 * 1024 * 1024); // <= 512MB
      expect(def.pidsLimit).toBeLessThanOrEqual(100);
      expect(def.cpuLimitNano).toBeLessThanOrEqual(1_000_000_000); // <= 1.0 vCPU
      expect(def.readOnlyRootfs).toBe(true);
      expect(def.tmpfsMounts['/tmp']).toContain('rw');
      expect(def.tmpfsMounts['/tmp']).toContain('size=');
      expect(def.ttlSeconds).toBeLessThanOrEqual(3600);
    }
  });
});
