import { DynamicChallengeDefinition } from './dynamic_challenges.types.js';

// Sensitive keys that must NEVER be injected into challenge containers
const FORBIDDEN_ENV_KEYS = new Set([
  'JWT_SECRET',
  'COOKIE_SECRET',
  'DATABASE_URL',
  'DB_PASSWORD',
  'POSTGRES_PASSWORD',
  'REDIS_PASSWORD',
  'FLAG_SALT',
  'FLAG_PREFIX',
]);

const VALID_IMAGE_REGEX = /^[a-zA-Z0-9_.-]+(\/[a-zA-Z0-9_.-]+)*(?::[a-zA-Z0-9_.-]+)?$/;

export class DynamicChallengeRegistry {
  private definitionsById = new Map<string, DynamicChallengeDefinition>();
  private definitionsBySlug = new Map<string, DynamicChallengeDefinition>();

  constructor() {
    this.initDefaultRegistry();
  }

  /**
   * Validate security constraints on a challenge manifest
   */
  public validateDefinition(def: DynamicChallengeDefinition): void {
    if (!def.challengeId || !def.slug) {
      throw new Error('Invalid definition: challengeId and slug are required');
    }

    if (!def.image || !VALID_IMAGE_REGEX.test(def.image)) {
      throw new Error(`Invalid definition: image '${def.image}' is malformed or invalid`);
    }

    if (!def.internalPort || def.internalPort < 1 || def.internalPort > 65535) {
      throw new Error(`Invalid definition: port ${def.internalPort} is out of valid range (1-65535)`);
    }

    // Memory bounds: min 16MB, max 1024MB
    const minMemory = 16 * 1024 * 1024;
    const maxMemory = 1024 * 1024 * 1024;
    if (def.memoryLimitBytes < minMemory || def.memoryLimitBytes > maxMemory) {
      throw new Error(`Invalid definition: memory limit ${def.memoryLimitBytes} bytes must be between 16MB and 1024MB`);
    }

    // CPU bounds: max 2.0 vCPUs (2_000_000_000 nanos)
    if (def.cpuLimitNano <= 0 || def.cpuLimitNano > 2_000_000_000) {
      throw new Error(`Invalid definition: CPU limit ${def.cpuLimitNano} nanos must be between 1 and 2,000,000,000 (2 vCPUs)`);
    }

    // PID limit bounds: min 10, max 500
    if (def.pidsLimit < 10 || def.pidsLimit > 500) {
      throw new Error(`Invalid definition: pidsLimit ${def.pidsLimit} must be between 10 and 500`);
    }

    // TTL bounds: min 60s, max 7200s (2 hours)
    if (def.ttlSeconds < 60 || def.ttlSeconds > 7200) {
      throw new Error(`Invalid definition: ttlSeconds ${def.ttlSeconds} must be between 60s and 7200s`);
    }

    // Secret isolation check
    if (def.envAllowlist) {
      for (const key of Object.keys(def.envAllowlist)) {
        if (FORBIDDEN_ENV_KEYS.has(key.toUpperCase())) {
          throw new Error(`Security Violation: Disallowed platform secret key '${key}' found in challenge environment allowlist`);
        }
      }
    }
  }

  /**
   * Authoritatively register a dynamic challenge definition
   */
  public registerChallenge(def: DynamicChallengeDefinition): void {
    this.validateDefinition(def);
    this.definitionsById.set(def.challengeId, def);
    this.definitionsBySlug.set(def.slug, def);
  }

  public getDefinition(identifier: string): DynamicChallengeDefinition | null {
    return this.definitionsById.get(identifier) || this.definitionsBySlug.get(identifier) || null;
  }

  public isDynamicChallenge(identifier: string): boolean {
    return this.definitionsById.has(identifier) || this.definitionsBySlug.has(identifier);
  }

  public getAllDefinitions(): DynamicChallengeDefinition[] {
    return Array.from(this.definitionsById.values());
  }

  public clear(): void {
    this.definitionsById.clear();
    this.definitionsBySlug.clear();
  }

  /**
   * Seed baseline dynamic challenges for TechX CTF 2026
   */
  private initDefaultRegistry(): void {
    // 1. Web SQL Injection Sandbox
    this.registerChallenge({
      challengeId: 'c1111111-1111-4111-8111-111111111111',
      slug: 'intro-sqli-sandbox',
      image: 'techx/web-sqli-sandbox:latest',
      internalPort: 8080,
      memoryLimitBytes: 256 * 1024 * 1024, // 256 MB
      cpuLimitNano: 500_000_000,           // 0.5 vCPU
      pidsLimit: 64,
      readOnlyRootfs: true,
      tmpfsMounts: { '/tmp': 'rw,noexec,nosuid,size=32m' },
      ttlSeconds: 1800, // 30 minutes
      healthCheckPath: '/health',
      envAllowlist: {
        APP_ENV: 'ctf',
      },
    });

    // 2. Web Command Injection Target
    this.registerChallenge({
      challengeId: 'c2222222-2222-4222-8222-222222222222',
      slug: 'ping-gateway-rce',
      image: 'techx/web-ping-rce:latest',
      internalPort: 8000,
      memoryLimitBytes: 256 * 1024 * 1024,
      cpuLimitNano: 500_000_000,
      pidsLimit: 64,
      readOnlyRootfs: true,
      tmpfsMounts: { '/tmp': 'rw,noexec,nosuid,size=32m' },
      ttlSeconds: 1800,
      healthCheckPath: '/',
    });

    // 3. Binary Exploitation Buffer Overflow Service
    this.registerChallenge({
      challengeId: 'c3333333-3333-4333-8333-333333333333',
      slug: 'echo-overflow-pwn',
      image: 'techx/pwn-echo-overflow:latest',
      internalPort: 9999,
      memoryLimitBytes: 128 * 1024 * 1024,
      cpuLimitNano: 250_000_000, // 0.25 vCPU
      pidsLimit: 32,
      readOnlyRootfs: true,
      tmpfsMounts: { '/tmp': 'rw,noexec,nosuid,size=16m' },
      ttlSeconds: 1800,
      healthCheckPath: '/',
    });
  }
}

export const dynamicChallengeRegistry = new DynamicChallengeRegistry();
