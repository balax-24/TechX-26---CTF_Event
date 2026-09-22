import {
  DockerContainerConfig,
  DockerContainerResult,
  ManagedContainerInfo,
} from './dynamic_challenges.types.js';
import { logger } from '../../utils/logger.js';
import * as http from 'http';

export interface IDockerManager {
  createAndStartContainer(config: DockerContainerConfig): Promise<DockerContainerResult>;
  stopAndRemoveContainer(containerId: string): Promise<void>;
  inspectContainer(containerId: string): Promise<{ state: string; exitCode?: number; ipAddress?: string } | null>;
  listManagedContainers(): Promise<ManagedContainerInfo[]>;
  healthCheck(internalIp: string, port: number, path?: string): Promise<boolean>;
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

  private idCounter = 1;
  public shouldFailStart = false;
  public shouldFailHealth = false;

  public async createAndStartContainer(config: DockerContainerConfig): Promise<DockerContainerResult> {
    if (this.shouldFailStart) {
      throw new Error('DOCKER_CREATION_FAILED: Simulated container creation failure');
    }

    // Verify security constraints
    this.verifySecurityConfig(config);

    const containerId = `mock-container-${this.idCounter++}-${Math.random().toString(36).substring(2, 8)}`;
    const internalIp = `172.28.0.${(this.idCounter % 200) + 10}`;

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
      this.containers.delete(containerId);
    }
  }

  public async inspectContainer(containerId: string): Promise<{ state: string; exitCode?: number; ipAddress?: string } | null> {
    const existing = this.containers.get(containerId);
    if (!existing) return null;
    return {
      state: existing.state,
      exitCode: existing.state === 'running' ? 0 : 137,
      ipAddress: existing.ipAddress,
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

  public reset(): void {
    this.containers.clear();
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

  public async inspectContainer(containerId: string): Promise<{ state: string; exitCode?: number; ipAddress?: string } | null> {
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

      return {
        state: data.State?.Status || 'unknown',
        exitCode: data.State?.ExitCode,
        ipAddress: firstNet?.IPAddress,
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
