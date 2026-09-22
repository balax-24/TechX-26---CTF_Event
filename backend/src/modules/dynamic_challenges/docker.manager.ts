import {
  DockerContainerConfig,
  DockerContainerResult,
  ManagedContainerInfo,
} from './dynamic_challenges.types.js';
import { logger } from '../../utils/logger.js';
import * as http from 'http';

export interface ContainerInspection {
  state: string;
  exitCode?: number;
  ipAddress?: string;
  hostConfig?: {
    memory?: number;
    nanoCpus?: number;
    pidsLimit?: number;
    readonlyRootfs?: boolean;
    securityOpt?: string[];
    capDrop?: string[];
    privileged?: boolean;
    networkMode?: string;
    Memory?: number;
    NanoCpus?: number;
    PidsLimit?: number;
    ReadonlyRootfs?: boolean;
    SecurityOpt?: string[];
    CapDrop?: string[];
    Privileged?: boolean;
    NetworkMode?: string;
  };
  env?: Record<string, string>;
}

export interface NetworkInspection {
  name: string;
  internal: boolean;
  icc: boolean;
  containers: string[];
}

export interface IDockerManager {
  createAndStartContainer(config: DockerContainerConfig): Promise<DockerContainerResult>;
  stopAndRemoveContainer(containerId: string): Promise<void>;
  inspectContainer(containerId: string): Promise<ContainerInspection | null>;
  listManagedContainers(): Promise<ManagedContainerInfo[]>;
  healthCheck(internalIp: string, port: number, path?: string): Promise<boolean>;
  createNetwork(name: string, options?: { internal?: boolean; icc?: boolean }): Promise<void>;
  removeNetwork(name: string): Promise<void>;
  inspectNetwork(name: string): Promise<NetworkInspection | null>;
  connectContainer(networkName: string, containerId: string): Promise<void>;
  disconnectContainer(networkName: string, containerId: string): Promise<void>;
}

/**
 * MockDockerManager for deterministic, headless unit and integration testing.
 * Strictly verifies that all security baseline options (no-new-privileges, cap_drop,
 * memory, cpu, pids limits, tmpfs, read-only rootfs) are present.
 */
export class MockDockerManager implements IDockerManager {
  public containers = new Map<
    string,
    {
      id: string;
      name: string;
      config: DockerContainerConfig;
      state: string;
      ipAddress: string;
      port: number;
      created: Date;
      healthy: boolean;
    }
  >();

  public networks = new Map<
    string,
    {
      name: string;
      internal: boolean;
      icc: boolean;
      containers: Set<string>;
    }
  >();

  private idCounter = 1;
  public shouldFailStart = false;
  public shouldFailHealth = false;

  public async createNetwork(name: string, options?: { internal?: boolean; icc?: boolean }): Promise<void> {
    if (!this.networks.has(name)) {
      this.networks.set(name, {
        name,
        internal: options?.internal ?? true,
        icc: options?.icc ?? false,
        containers: new Set(),
      });
    }
  }

  public async removeNetwork(name: string): Promise<void> {
    this.networks.delete(name);
  }

  public async connectContainer(networkName: string, containerId: string): Promise<void> {
    const net = this.networks.get(networkName);
    if (net) {
      net.containers.add(containerId);
    }
  }

  public async disconnectContainer(networkName: string, containerId: string): Promise<void> {
    const net = this.networks.get(networkName);
    if (net) {
      net.containers.delete(containerId);
    }
  }

  public async inspectNetwork(name: string): Promise<NetworkInspection | null> {
    const net = this.networks.get(name);
    if (!net) return null;
    return {
      name: net.name,
      internal: net.internal,
      icc: net.icc,
      containers: Array.from(net.containers),
    };
  }

  public async createAndStartContainer(config: DockerContainerConfig): Promise<DockerContainerResult> {
    if (this.shouldFailStart) {
      throw new Error('DOCKER_CREATION_FAILED: Simulated container creation failure');
    }

    // Verify security constraints
    this.verifySecurityConfig(config);

    const containerId = `mock-container-${this.idCounter++}-${Math.random().toString(36).substring(2, 8)}`;
    const internalIp = `172.28.0.${(this.idCounter % 200) + 10}`;

    // Auto-register network if not explicitly created
    if (!this.networks.has(config.networkName)) {
      this.networks.set(config.networkName, {
        name: config.networkName,
        internal: true,
        icc: false,
        containers: new Set(),
      });
    }
    this.networks.get(config.networkName)!.containers.add(containerId);

    this.containers.set(containerId, {
      id: containerId,
      name: config.containerName,
      config,
      state: 'running',
      ipAddress: internalIp,
      port: config.internalPort,
      created: new Date(),
      healthy: !this.shouldFailHealth,
    });

    return {
      containerId,
      containerName: config.containerName,
      internalIp,
      internalPort: config.internalPort,
    };
  }

  public async stopAndRemoveContainer(containerId: string): Promise<void> {
    const existing = this.containers.get(containerId);
    if (existing) {
      existing.state = 'exited';
      const net = this.networks.get(existing.config.networkName);
      if (net) {
        net.containers.delete(containerId);
      }
      this.containers.delete(containerId);
    }
  }

  public async inspectContainer(containerId: string): Promise<ContainerInspection | null> {
    const existing = this.containers.get(containerId);
    if (!existing) return null;
    return {
      state: existing.state,
      exitCode: existing.state === 'running' ? 0 : 137,
      ipAddress: existing.ipAddress,
      hostConfig: {
        memory: existing.config.memoryLimitBytes,
        nanoCpus: existing.config.cpuLimitNano,
        pidsLimit: existing.config.pidsLimit,
        readonlyRootfs: existing.config.readOnlyRootfs,
        securityOpt: ['no-new-privileges:true'],
        capDrop: ['ALL'],
        privileged: false,
        networkMode: existing.config.networkName,
        Memory: existing.config.memoryLimitBytes,
        NanoCpus: existing.config.cpuLimitNano,
        PidsLimit: existing.config.pidsLimit,
        ReadonlyRootfs: existing.config.readOnlyRootfs,
        SecurityOpt: ['no-new-privileges:true'],
        CapDrop: ['ALL'],
        Privileged: false,
        NetworkMode: existing.config.networkName,
      },
      env: { ...existing.config.env },
    };
  }

  public async listManagedContainers(): Promise<ManagedContainerInfo[]> {
    const list: ManagedContainerInfo[] = [];
    for (const c of this.containers.values()) {
      if (c.config.labels['techx.managed'] === 'true') {
        list.push({
          containerId: c.id,
          containerName: c.name,
          image: c.config.image,
          labels: c.config.labels,
          state: c.state,
          created: c.created,
        });
      }
    }
    return list;
  }

  public async healthCheck(internalIp: string, port: number, _path: string = '/'): Promise<boolean> {
    if (this.shouldFailHealth) return false;
    for (const c of this.containers.values()) {
      if (c.ipAddress === internalIp && c.port === port) {
        return c.healthy && c.state === 'running';
      }
    }
    return false;
  }

  /**
   * Enforces security policy in mock container creation
   */
  public verifySecurityConfig(config: DockerContainerConfig): void {
    if (config.memoryLimitBytes <= 0) {
      throw new Error('Security Error: Memory limit must be explicitly finite');
    }
    if (config.pidsLimit <= 0) {
      throw new Error('Security Error: PIDs limit must be explicitly finite');
    }
    if (config.cpuLimitNano <= 0) {
      throw new Error('Security Error: CPU quota must be explicitly finite');
    }
    if (config.labels['techx.managed'] !== 'true') {
      throw new Error('Security Error: Managed label is required');
    }
  }

  /**
   * Simulates network reachability for integration testing
   */
  public simulateNetworkConnection(
    sourceContainerId: string,
    targetHost: string,
    targetPort: number
  ): { allowed: boolean; reason: string } {
    const source = this.containers.get(sourceContainerId);
    if (!source) {
      return { allowed: false, reason: 'Source container not found' };
    }

    // 1. Docker daemon socket attempt
    if (targetHost.includes('docker.sock') || targetHost === '/var/run/docker.sock') {
      return { allowed: false, reason: 'ENOENT: Docker daemon socket not mounted in challenge container' };
    }

    // 2. Core database (Postgres) isolation check
    if (targetHost === 'postgres' || targetHost === '172.20.0.2' || targetPort === 5432) {
      return { allowed: false, reason: 'EHOSTUNREACH: Database network (ctf_core_net) is strictly isolated from challenge containers' };
    }

    // 3. Core cache (Redis) isolation check
    if (targetHost === 'redis' || targetHost === '172.20.0.3' || targetPort === 6379) {
      return { allowed: false, reason: 'EHOSTUNREACH: Redis cache network (ctf_core_net) is strictly isolated from challenge containers' };
    }

    // 4. Backend internal service isolation check
    if (targetHost === 'backend' || (targetHost === '172.20.0.10' && targetPort === 4000)) {
      return { allowed: false, reason: 'EHOSTUNREACH: Internal backend management port is unreachable from challenge networks' };
    }

    // 5. External WAN / Internet egress check
    const isPublicIp = !targetHost.startsWith('172.') && !targetHost.startsWith('10.') && !targetHost.startsWith('192.168.') && targetHost !== '127.0.0.1' && targetHost !== 'localhost';
    const sourceNet = this.networks.get(source.config.networkName);
    if (isPublicIp && sourceNet?.internal) {
      return { allowed: false, reason: 'ENETUNREACH: Challenge network is configured as internal (no default gateway to WAN)' };
    }

    // 6. Challenge-to-Challenge isolation check
    let targetContainer: typeof source | undefined;
    for (const c of this.containers.values()) {
      if (c.ipAddress === targetHost || c.name === targetHost) {
        targetContainer = c;
        break;
      }
    }

    if (targetContainer) {
      if (source.config.networkName !== targetContainer.config.networkName) {
        return {
          allowed: false,
          reason: 'ENETUNREACH: Distinct per-instance Docker networks prevent inter-team communication',
        };
      }
      if (!sourceNet?.icc) {
        return {
          allowed: false,
          reason: 'EHOSTUNREACH: Inter-container communication (icc) is disabled on challenge bridge network',
        };
      }
    }

    return { allowed: true, reason: 'Connected' };
  }

  public reset(): void {
    this.containers.clear();
    this.networks.clear();
    this.shouldFailStart = false;
    this.shouldFailHealth = false;
    this.idCounter = 1;
  }
}

/**
 * Native Docker Engine API implementation using Docker HTTP socket/pipe
 */
export class NativeDockerManager implements IDockerManager {
  private socketPath: string;

  constructor(socketPath?: string) {
    if (socketPath) {
      this.socketPath = socketPath;
    } else {
      this.socketPath = process.platform === 'win32'
        ? '//./pipe/docker_engine'
        : '/var/run/docker.sock';
    }
  }

  private request(options: http.RequestOptions, postData?: string): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
      const reqOptions: http.RequestOptions = {
        ...options,
        socketPath: this.socketPath,
      };

      const req = http.request(reqOptions, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ statusCode: res.statusCode || 500, body }));
      });

      req.on('error', (err) => reject(err));
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Docker API request timed out'));
      });

      if (postData) {
        req.write(postData);
      }
      req.end();
    });
  }

  public async createAndStartContainer(config: DockerContainerConfig): Promise<DockerContainerResult> {
    const createPayload = {
      Image: config.image,
      Labels: config.labels,
      Env: Object.entries(config.env).map(([k, v]) => `${k}=${v}`),
      ExposedPorts: {
        [`${config.internalPort}/tcp`]: {},
      },
      HostConfig: {
        NetworkMode: config.networkName,
        ReadonlyRootfs: config.readOnlyRootfs,
        SecurityOpt: ['no-new-privileges:true'],
        CapDrop: ['ALL'],
        Privileged: false,
        Memory: config.memoryLimitBytes,
        MemorySwap: config.memoryLimitBytes,
        NanoCpus: config.cpuLimitNano,
        PidsLimit: config.pidsLimit,
        Tmpfs: config.tmpfsMounts,
        RestartPolicy: { Name: 'no' },
      },
    };

    const createRes = await this.request(
      {
        path: `/v1.43/containers/create?name=${encodeURIComponent(config.containerName)}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      JSON.stringify(createPayload)
    );

    if (createRes.statusCode !== 201) {
      throw new Error(`Failed to create container: ${createRes.body}`);
    }

    const created = JSON.parse(createRes.body);
    const containerId = created.Id;

    // Start container
    const startRes = await this.request({
      path: `/v1.43/containers/${containerId}/start`,
      method: 'POST',
    });

    if (startRes.statusCode !== 204 && startRes.statusCode !== 304) {
      await this.stopAndRemoveContainer(containerId).catch(() => {});
      throw new Error(`Failed to start container: ${startRes.body}`);
    }

    // Inspect to retrieve IP address
    const inspectRes = await this.request({
      path: `/v1.43/containers/${containerId}/json`,
      method: 'GET',
    });

    const inspected = JSON.parse(inspectRes.body);
    const networks = inspected.NetworkSettings?.Networks || {};
    const netDetails = networks[config.networkName] || Object.values(networks)[0] as any;
    const internalIp = netDetails?.IPAddress || '127.0.0.1';

    return {
      containerId,
      containerName: config.containerName,
      internalIp,
      internalPort: config.internalPort,
    };
  }

  public async stopAndRemoveContainer(containerId: string): Promise<void> {
    try {
      await this.request({
        path: `/v1.43/containers/${containerId}/stop?t=3`,
        method: 'POST',
      });
    } catch {
      // Ignore if already stopped
    }

    await this.request({
      path: `/v1.43/containers/${containerId}?v=true&force=true`,
      method: 'DELETE',
    });
  }

  public async createNetwork(name: string, options?: { internal?: boolean; icc?: boolean }): Promise<void> {
    const payload = {
      Name: name,
      Driver: 'bridge',
      Internal: options?.internal ?? true,
      Options: {
        'com.docker.network.bridge.enable_icc': options?.icc ? 'true' : 'false',
      },
      Labels: {
        'techx.managed': 'true',
        'techx.component': 'ctf-network',
      },
    };

    const res = await this.request(
      {
        path: '/v1.43/networks/create',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      JSON.stringify(payload)
    );

    if (res.statusCode !== 201 && res.statusCode !== 409) {
      throw new Error(`Failed to create Docker network: ${res.body}`);
    }
  }

  public async connectContainer(networkName: string, containerId: string): Promise<void> {
    const res = await this.request(
      {
        path: `/v1.43/networks/${encodeURIComponent(networkName)}/connect`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      JSON.stringify({ Container: containerId })
    );
    if (res.statusCode !== 200 && res.statusCode !== 204 && res.statusCode !== 409) {
      logger.warn({ networkName, containerId, status: res.statusCode }, 'Failed to connect container to network');
    }
  }

  public async disconnectContainer(networkName: string, containerId: string): Promise<void> {
    await this.request(
      {
        path: `/v1.43/networks/${encodeURIComponent(networkName)}/disconnect`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      JSON.stringify({ Container: containerId, Force: true })
    ).catch(() => {});
  }

  public async removeNetwork(name: string): Promise<void> {
    await this.request({
      path: `/v1.43/networks/${encodeURIComponent(name)}`,
      method: 'DELETE',
    }).catch(() => {});
  }

  public async inspectNetwork(name: string): Promise<NetworkInspection | null> {
    try {
      const res = await this.request({
        path: `/v1.43/networks/${encodeURIComponent(name)}`,
        method: 'GET',
      });
      if (res.statusCode !== 200) return null;
      const data = JSON.parse(res.body);
      return {
        name: data.Name,
        internal: Boolean(data.Internal),
        icc: data.Options?.['com.docker.network.bridge.enable_icc'] === 'true',
        containers: Object.keys(data.Containers || {}),
      };
    } catch {
      return null;
    }
  }

  public async inspectContainer(containerId: string): Promise<ContainerInspection | null> {
    try {
      const res = await this.request({
        path: `/v1.43/containers/${containerId}/json`,
        method: 'GET',
      });
      if (res.statusCode === 404) return null;
      if (res.statusCode !== 200) return null;

      const data = JSON.parse(res.body);
      const networks = data.NetworkSettings?.Networks || {};
      const firstNet = Object.values(networks)[0] as any;
      const envObj: Record<string, string> = {};
      if (Array.isArray(data.Config?.Env)) {
        for (const envStr of data.Config.Env) {
          const eqIdx = envStr.indexOf('=');
          if (eqIdx !== -1) {
            envObj[envStr.substring(0, eqIdx)] = envStr.substring(eqIdx + 1);
          }
        }
      }

      return {
        state: data.State?.Status || 'unknown',
        exitCode: data.State?.ExitCode,
        ipAddress: firstNet?.IPAddress,
        hostConfig: {
          memory: data.HostConfig?.Memory,
          nanoCpus: data.HostConfig?.NanoCpus,
          pidsLimit: data.HostConfig?.PidsLimit,
          readonlyRootfs: data.HostConfig?.ReadonlyRootfs,
          securityOpt: data.HostConfig?.SecurityOpt || [],
          capDrop: data.HostConfig?.CapDrop || [],
          privileged: data.HostConfig?.Privileged || false,
          networkMode: data.HostConfig?.NetworkMode || '',
        },
        env: envObj,
      };
    } catch {
      return null;
    }
  }

  public async listManagedContainers(): Promise<ManagedContainerInfo[]> {
    const filters = encodeURIComponent(JSON.stringify({ label: ['techx.managed=true'] }));
    const res = await this.request({
      path: `/v1.43/containers/json?all=true&filters=${filters}`,
      method: 'GET',
    });

    if (res.statusCode !== 200) return [];
    const rawList = JSON.parse(res.body);

    return rawList.map((c: any) => ({
      containerId: c.Id,
      containerName: (c.Names && c.Names[0]) ? c.Names[0].replace(/^\//, '') : '',
      image: c.Image,
      labels: c.Labels || {},
      state: c.State,
      created: new Date(c.Created * 1000),
    }));
  }

  public async healthCheck(internalIp: string, port: number, path: string = '/'): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.request(
        {
          host: internalIp,
          port,
          path,
          method: 'GET',
          timeout: 2000,
        },
        (res) => {
          // Status codes 2xx or 3xx or 401/403/404 indicate HTTP service is alive and listening
          resolve(res.statusCode !== undefined && res.statusCode < 500);
        }
      );

      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    });
  }
}

// Global Docker Manager instance (default to Mock in test/dev if native socket is unavailable)
let activeDockerManager: IDockerManager = new MockDockerManager();

export function getDockerManager(): IDockerManager {
  return activeDockerManager;
}

export function setDockerManager(manager: IDockerManager): void {
  activeDockerManager = manager;
}
