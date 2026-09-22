export type InstanceStatus =
  | 'CREATING'
  | 'RUNNING'
  | 'STOPPING'
  | 'STOPPED'
  | 'EXPIRED'
  | 'FAILED';

export interface DynamicChallengeDefinition {
  challengeId: string;
  slug: string;
  image: string;
  internalPort: number;
  memoryLimitBytes: number; // e.g. 256MB
  cpuLimitNano: number;     // e.g. 0.5 vCPU = 500_000_000
  pidsLimit: number;        // e.g. 64 to prevent fork bombs
  readOnlyRootfs: boolean;  // true by default
  tmpfsMounts: Record<string, string>; // e.g. { '/tmp': 'rw,noexec,nosuid,size=32m' }
  ttlSeconds: number;       // default 1800s (30m), max 3600s (60m)
  envAllowlist?: Record<string, string>; // strictly limited safe variables
  healthCheckPath?: string; // e.g. '/health' or '/'
}

export interface DockerContainerConfig {
  containerName: string;
  image: string;
  networkName: string;
  internalPort: number;
  memoryLimitBytes: number;
  cpuLimitNano: number;
  pidsLimit: number;
  readOnlyRootfs: boolean;
  tmpfsMounts: Record<string, string>;
  env: Record<string, string>;
  labels: Record<string, string>;
}

export interface DockerContainerResult {
  containerId: string;
  containerName: string;
  internalIp: string;
  internalPort: number;
}

export interface ManagedContainerInfo {
  containerId: string;
  containerName: string;
  image: string;
  labels: Record<string, string>;
  state: string;
  created: Date;
}

export interface InstanceSummary {
  id: string;
  challengeId: string;
  challengeSlug: string;
  status: InstanceStatus;
  connectionUrl: string;
  createdAt: string;
  expiresAt: string;
  remainingTtlSeconds: number;
  failureReason?: string | null;
}
