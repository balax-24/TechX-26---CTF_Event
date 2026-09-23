import * as http from 'http';
import {
  CreateInstanceDto,
  InstanceCreationResult,
  ManagedContainerInfo,
} from './dynamic_challenges.types.js';
import {
  ContainerInspection,
  IDockerManager,
  getDockerManager,
} from './docker.manager.js';
import { logger } from '../../utils/logger.js';

/**
 * Dedicated Challenge Gateway & Infrastructure Service.
 *
 * Security Boundary:
 * 1. Isolates Docker lifecycle and reverse proxy functions from the Core Backend.
 * 2. Connects ONLY the Gateway container (techx_challenge_gateway) to per-instance challenge networks.
 * 3. The Core Backend NEVER attaches to challenge networks and has NO Docker socket.
 * 4. Strictly validates target destinations, strips client spoofing headers, and preserves
 *    3xx redirect pass-through without following upstream redirects.
 */
export class ChallengeGatewayService {
  private customDockerManager?: IDockerManager;
  private activeInstances = new Map<string, InstanceCreationResult>();
  private gatewayContainerName: string | null = null;
  public allowLoopbackProxy: boolean = process.env.NODE_ENV !== 'production';
  public trustedBindIp?: string;

  /**
   * Checks if an IP originates from a participant challenge container or challenge bridge subnet.
   */
  public isChallengeNetworkIp(ip?: string): boolean {
    if (!ip) return false;
    const cleanIp = ip.replace(/^::ffff:/, '');
    for (const inst of this.activeInstances.values()) {
      if (inst.internalIp === cleanIp) return true;
      const parts = inst.internalIp.split('.');
      if (parts.length === 4) {
        const subnetPrefix = `${parts[0]}.${parts[1]}.${parts[2]}.`;
        if (cleanIp.startsWith(subnetPrefix)) return true;
      }
    }
    return false;
  }

  constructor(dockerManager?: IDockerManager) {
    this.customDockerManager = dockerManager;
    this.gatewayContainerName = process.env.GATEWAY_CONTAINER_NAME || null;
  }

  public get dockerManager(): IDockerManager {
    return this.customDockerManager || getDockerManager();
  }

  public setDockerManager(manager: IDockerManager): void {
    this.customDockerManager = manager;
  }

  public registerInstance(instance: InstanceCreationResult): void {
    if (instance.instanceId) {
      this.activeInstances.set(instance.instanceId, instance);
    }
    this.activeInstances.set(instance.containerId, instance);
    this.activeInstances.set(instance.containerName, instance);
  }

  public getInstance(idOrName: string): InstanceCreationResult | undefined {
    return this.activeInstances.get(idOrName);
  }

  /**
   * Creates a dedicated per-instance bridge network and launches the challenge container.
   * Dynamically attaches the Gateway container to the network (never the Core Backend).
   */
  public async createAndStartInstance(dto: CreateInstanceDto): Promise<InstanceCreationResult> {
    const teamPrefix = (dto.teamId || 'team').substring(0, 8);
    const instancePrefix = (dto.instanceId || 'inst').substring(0, 8);
    const networkName = `techx-inst-net-${instancePrefix}`;
    const containerName = `techx-chal-${dto.slug}-${teamPrefix}-${instancePrefix}`;

    // 1. Create per-instance bridge network (internal: true prevents WAN egress, icc: true allows gateway to reach container)
    await this.dockerManager.createNetwork(networkName, { internal: true, icc: true });

    // 2. Attach Gateway container (NOT Core Backend) to the per-instance bridge
    if (this.gatewayContainerName) {
      await this.dockerManager.connectContainer(networkName, this.gatewayContainerName).catch(() => {});
    }

    // 3. Sanitize environment variables against sensitive platform secrets
    const forbiddenKeys = new Set([
      'GATEWAY_SECRET',
      'CHALLENGE_GATEWAY_SECRET',
      'CHALLENGE_GATEWAY_URL',
      'GATEWAY_URL',
      'JWT_SECRET',
      'SESSION_SECRET',
      'ADMIN_PASSWORD',
      'DATABASE_URL',
      'REDIS_URL',
      'REDIS_PASSWORD',
      'FLAG_SALT',
      'FLAG_PREFIX',
      'DOCKER_SOCK',
      'DOCKER_HOST',
    ]);
    const sanitizedEnv: Record<string, string> = {};
    if (dto.envAllowlist) {
      for (const [k, v] of Object.entries(dto.envAllowlist)) {
        if (!forbiddenKeys.has(k.toUpperCase())) {
          sanitizedEnv[k] = v;
        }
      }
    }

    // 4. Launch hardened challenge container
    const containerResult = await this.dockerManager.createAndStartContainer({
      containerName,
      image: dto.image,
      networkName,
      internalPort: dto.internalPort,
      memoryLimitBytes: dto.memoryLimitBytes,
      cpuLimitNano: dto.cpuLimitNano,
      pidsLimit: dto.pidsLimit,
      readOnlyRootfs: dto.readOnlyRootfs,
      tmpfsMounts: dto.tmpfsMounts,
      env: {
        ...sanitizedEnv,
        CHALLENGE_INSTANCE_ID: dto.instanceId,
        CHALLENGE_PORT: String(dto.internalPort),
      },
      labels: {
        'techx.managed': 'true',
        'techx.component': 'ctf-challenge',
        'techx.instance_id': dto.instanceId,
        'techx.challenge_id': dto.challengeId,
        'techx.team_id': dto.teamId,
      },
    });

    // 4. Initial health check
    const isHealthy = await this.dockerManager.healthCheck(
      containerResult.internalIp,
      containerResult.internalPort,
      dto.healthCheckPath || '/'
    );

    if (!isHealthy) {
      logger.warn({ instanceId: dto.instanceId, containerName }, 'Challenge container did not pass initial health check');
    }

    const result: InstanceCreationResult = {
      instanceId: dto.instanceId,
      containerId: containerResult.containerId,
      containerName,
      networkName,
      internalIp: containerResult.internalIp,
      internalPort: containerResult.internalPort,
    };

    this.activeInstances.set(dto.instanceId, result);
    this.activeInstances.set(containerResult.containerId, result);

    return result;
  }

  /**
   * Stops container, detaches Gateway from network, and deletes network.
   */
  public async stopAndRemoveInstance(instanceId: string): Promise<void> {
    const instance = this.activeInstances.get(instanceId);
    const networkName = instance?.networkName || `techx-inst-net-${instanceId.substring(0, 8)}`;
    const containerId = instance?.containerId;

    if (containerId) {
      await this.dockerManager.stopAndRemoveContainer(containerId).catch((err) => {
        logger.warn({ err: err.message, containerId }, 'Error stopping challenge container');
      });
      this.activeInstances.delete(containerId);
    } else {
      const managed = await this.dockerManager.listManagedContainers().catch(() => []);
      for (const c of managed) {
        if (c.labels?.['techx.instance_id'] === instanceId || c.containerName.includes(instanceId.substring(0, 8))) {
          await this.dockerManager.stopAndRemoveContainer(c.containerId).catch(() => {});
        }
      }
    }
    this.activeInstances.delete(instanceId);

    // Disconnect Gateway container from per-instance network
    if (this.gatewayContainerName) {
      await this.dockerManager.disconnectContainer(networkName, this.gatewayContainerName).catch(() => {});
    }

    // Remove per-instance network
    await this.dockerManager.removeNetwork(networkName).catch(() => {});
  }

  public async inspectInstance(instanceId: string): Promise<ContainerInspection | null> {
    const instance = this.activeInstances.get(instanceId);
    const targetId = instance ? instance.containerId : instanceId;
    return await this.dockerManager.inspectContainer(targetId);
  }

  public async listManagedContainers(): Promise<ManagedContainerInfo[]> {
    return await this.dockerManager.listManagedContainers();
  }

  public async stopAndRemoveContainer(containerId: string): Promise<void> {
    await this.dockerManager.stopAndRemoveContainer(containerId);
    this.activeInstances.delete(containerId);
  }

  public async healthCheck(internalIp: string, port: number, path: string = '/'): Promise<boolean> {
    return await this.dockerManager.healthCheck(internalIp, port, path);
  }

  /**
   * Proxies an incoming HTTP request directly to the isolated challenge container.
   *
   * Hardened Invariants:
   * 1. Target IP and port originate strictly from server-verified instance registry or target config.
   * 2. Rejects loopback, AWS/GCP metadata (169.254.169.254), or non-challenge subnets.
   * 3. Rejects CRLF, null bytes, and path smuggling.
   * 4. Strips hop-by-hop and client spoofing headers.
   * 5. Passes 3xx responses directly through to caller without following redirects.
   */
  public proxyRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    target: { internalIp: string; internalPort: number },
    subpath: string
  ): Promise<void> {
    return new Promise((resolve) => {
      // 1. Strict IP validation: Must be dotted-decimal IPv4
      const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      if (!ipv4Regex.test(target.internalIp)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ statusCode: 403, error: 'FORBIDDEN', message: 'Target destination is forbidden: Invalid or non-IPv4 destination' }));
        return resolve();
      }

      // 2. Prohibit routing to loopback, cloud metadata (169.254.169.254), link-local, or broadcast/wildcard
      const isLoopback = target.internalIp.startsWith('127.') || target.internalIp === 'localhost';
      const isMetadata = target.internalIp === '169.254.169.254' || target.internalIp.startsWith('169.254.');
      const isWildcard = target.internalIp === '0.0.0.0' || target.internalIp === '255.255.255.255';

      if (isMetadata || isWildcard || (isLoopback && !this.allowLoopbackProxy)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ statusCode: 403, error: 'FORBIDDEN', message: 'Target destination is forbidden' }));
        return resolve();
      }

      // 3. Strict Port validation: Integer between 1 and 65535
      if (
        !Number.isInteger(target.internalPort) ||
        target.internalPort < 1 ||
        target.internalPort > 65535
      ) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ statusCode: 500, error: 'INTERNAL_SERVER_ERROR', message: 'Invalid instance port' }));
        return resolve();
      }

      // 4. Reject CRLF and null byte path injections
      if (/[\r\n\0]/.test(req.url || '') || /[\r\n\0]/.test(subpath)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ statusCode: 400, error: 'BAD_REQUEST', message: 'Invalid characters in request path' }));
        return resolve();
      }

      let rawQuery = '';
      const reqUrl = req.url || '';
      const qIndex = reqUrl.indexOf('?');
      if (qIndex !== -1) {
        rawQuery = reqUrl.substring(qIndex);
        const hashIndex = rawQuery.indexOf('#');
        if (hashIndex !== -1) {
          rawQuery = rawQuery.substring(0, hashIndex);
        }
      }

      const cleanSubpath = subpath.replace(/^\//, '').split('#')[0];
      const upstreamPath = '/' + cleanSubpath + rawQuery;

      // 5. Filter hop-by-hop and client spoofing headers
      const forwardHeaders: Record<string, any> = {};
      const forbiddenHeaders = new Set([
        'host',
        'connection',
        'keep-alive',
        'proxy-authenticate',
        'proxy-authorization',
        'te',
        'trailer',
        'transfer-encoding',
        'upgrade',
        'x-target-host',
        'x-target-ip',
        'x-target-port',
        'x-upstream-url',
        'x-upstream-host',
        'x-forwarded-host',
        'x-forwarded-server',
        'x-docker-host',
        'x-gateway-secret',
      ]);

      for (const [k, v] of Object.entries(req.headers)) {
        if (!forbiddenHeaders.has(k.toLowerCase()) && v !== undefined) {
          forwardHeaders[k.toLowerCase()] = v;
        }
      }

      forwardHeaders['host'] = `${target.internalIp}:${target.internalPort}`;
      forwardHeaders['x-forwarded-for'] = req.socket?.remoteAddress || '127.0.0.1';
      forwardHeaders['x-forwarded-proto'] = 'http';

      const proxyReq = http.request(
        {
          host: target.internalIp,
          port: target.internalPort,
          path: upstreamPath,
          method: req.method,
          headers: forwardHeaders,
          timeout: 10000,
        },
        (proxyRes) => {
          // Pass status code and headers (including 3xx redirect Location) directly to caller
          const headers: Record<string, any> = {};
          for (const [k, v] of Object.entries(proxyRes.headers)) {
            if (k.toLowerCase() !== 'transfer-encoding' && v !== undefined) {
              headers[k] = v;
            }
          }

          res.writeHead(proxyRes.statusCode || 200, headers);
          proxyRes.pipe(res);
          proxyRes.on('end', () => resolve());
        }
      );

      proxyReq.on('error', (err) => {
        logger.error({ err: err.message }, 'Upstream challenge proxy error');
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            statusCode: 502,
            error: 'BAD_GATEWAY',
            message: 'Challenge instance is not responding or unreachable',
          }));
        }
        resolve();
      });

      proxyReq.on('timeout', () => {
        proxyReq.destroy();
        if (!res.headersSent) {
          res.writeHead(504, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            statusCode: 504,
            error: 'GATEWAY_TIMEOUT',
            message: 'Challenge instance request timed out',
          }));
        }
        resolve();
      });

      req.pipe(proxyReq);
    });
  }
}

/**
 * Creates the HTTP server for the standalone Challenge Gateway service.
 */
export function createGatewayHttpServer(
  service: ChallengeGatewayService,
  expectedSecret: string
): http.Server {
  const server = http.createServer(async (req, res) => {
    const url = req.url || '/';
    const method = req.method || 'GET';

    // 1. Prohibit arbitrary TCP/HTTP CONNECT tunneling
    if (method === 'CONNECT') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        statusCode: 405,
        error: 'METHOD_NOT_ALLOWED',
        message: 'Arbitrary TCP/HTTP CONNECT tunneling is forbidden',
      }));
      return;
    }

    const remoteIp = (req.socket?.remoteAddress || '').replace(/^::ffff:/, '');

    // 2. Health probe (unauthenticated for Docker container health check)
    if (url === '/health' && method === 'GET') {
      if (service.isChallengeNetworkIp(remoteIp)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          statusCode: 403,
          error: 'FORBIDDEN',
          message: 'Health probe forbidden from challenge network',
        }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'techx-challenge-gateway' }));
      return;
    }

    // 3. Network origin restriction: Control API endpoints (/internal/*) MUST NEVER be reachable from participant challenge networks
    if (url.startsWith('/internal/')) {
      if (service.isChallengeNetworkIp(remoteIp)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          statusCode: 403,
          error: 'FORBIDDEN',
          message: 'Gateway control API is restricted to trusted management network',
        }));
        return;
      }
    }

    // 4. Require x-gateway-secret for all internal and proxy operations
    const providedSecret = req.headers['x-gateway-secret'];
    if (!providedSecret || providedSecret !== expectedSecret) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        statusCode: 403,
        error: 'FORBIDDEN',
        message: 'Invalid or missing challenge gateway secret',
      }));
      return;
    }

    // Read body if POST/PUT/PATCH/DELETE with 1MB max body limit defense
    let bodyText = '';
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      bodyText = await new Promise<string>((resolve) => {
        let text = '';
        let bytesRead = 0;
        const maxBytes = 1024 * 1024; // 1MB maximum payload
        req.on('data', (c) => {
          bytesRead += c.length;
          if (bytesRead > maxBytes) {
            req.destroy();
            if (!res.headersSent) {
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ statusCode: 413, error: 'PAYLOAD_TOO_LARGE', message: 'Payload exceeds limit' }));
            }
            return;
          }
          text += c.toString('utf-8');
        });
        req.on('end', () => resolve(text));
        req.on('error', () => resolve(''));
      });
      if (res.writableEnded) return;
    }

    // Route: POST /internal/instances
    if (url === '/internal/instances' && method === 'POST') {
      try {
        const body = JSON.parse(bodyText);
        const result = await service.createAndStartInstance(body);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, result }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // Route: POST /internal/instances/:instanceId/stop
    if (url.startsWith('/internal/instances/') && url.endsWith('/stop') && method === 'POST') {
      const parts = url.split('/');
      const instanceId = parts[3];
      try {
        await service.stopAndRemoveInstance(instanceId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // Route: GET /internal/instances/:instanceId/inspect
    if (url.startsWith('/internal/instances/') && url.endsWith('/inspect') && method === 'GET') {
      const parts = url.split('/');
      const instanceId = parts[3];
      try {
        const info = await service.inspectInstance(instanceId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, info }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // Route: GET /internal/containers/managed
    if (url === '/internal/containers/managed' && method === 'GET') {
      try {
        const containers = await service.listManagedContainers();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, containers }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // Route: DELETE /internal/containers/:containerId
    if (url.startsWith('/internal/containers/') && method === 'DELETE') {
      const containerId = url.split('/')[3];
      try {
        await service.stopAndRemoveContainer(containerId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // Route: ALL /proxy/:instanceId/*
    if (url.startsWith('/proxy/')) {
      const parts = url.substring('/proxy/'.length).split('/');
      const instanceId = parts[0];
      const subpath = '/' + parts.slice(1).join('/');

      const instance = service.getInstance(instanceId);
      if (!instance) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          statusCode: 404,
          error: 'NOT_FOUND',
          message: 'Instance not found in challenge gateway registry',
        }));
        return;
      }

      await service.proxyRequest(req, res, {
        internalIp: instance.internalIp,
        internalPort: instance.internalPort,
      }, subpath);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'NOT_FOUND' }));
  });

  server.on('connect', (_req, clientSocket) => {
    clientSocket.write('HTTP/1.1 405 Method Not Allowed\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{"statusCode":405,"error":"METHOD_NOT_ALLOWED","message":"Arbitrary TCP/HTTP CONNECT tunneling is forbidden"}');
    clientSocket.destroy();
  });

  return server;
}
