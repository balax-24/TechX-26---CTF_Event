import * as http from 'http';
import { FastifyRequest, FastifyReply } from 'fastify';
import {
  CreateInstanceDto,
  InstanceCreationResult,
  ManagedContainerInfo,
} from './dynamic_challenges.types.js';
import { ContainerInspection } from './docker.manager.js';
import { ChallengeGatewayService } from './challenge_gateway.service.js';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

export interface IChallengeGatewayClient {
  createAndStartInstance(dto: CreateInstanceDto): Promise<InstanceCreationResult>;
  stopAndRemoveInstance(instanceId: string): Promise<void>;
  inspectInstance(instanceId: string): Promise<ContainerInspection | null>;
  listManagedContainers(): Promise<ManagedContainerInfo[]>;
  stopAndRemoveContainer(containerId: string): Promise<void>;
  healthCheck(internalIp: string, port: number, path?: string): Promise<boolean>;
  proxy(
    req: FastifyRequest,
    reply: FastifyReply,
    target: { instanceId?: string; internalIp: string; internalPort: number }
  ): Promise<void>;
}

/**
 * Direct In-Process Client for headless testing and local development.
 * Bridges Core Backend and GatewayService without requiring a running Docker daemon or external HTTP listener.
 */
export class DirectChallengeGatewayClient implements IChallengeGatewayClient {
  constructor(public service: ChallengeGatewayService) {}

  public async createAndStartInstance(dto: CreateInstanceDto): Promise<InstanceCreationResult> {
    return await this.service.createAndStartInstance(dto);
  }

  public async stopAndRemoveInstance(instanceId: string): Promise<void> {
    await this.service.stopAndRemoveInstance(instanceId);
  }

  public async inspectInstance(instanceId: string): Promise<ContainerInspection | null> {
    return await this.service.inspectInstance(instanceId);
  }

  public async listManagedContainers(): Promise<ManagedContainerInfo[]> {
    return await this.service.listManagedContainers();
  }

  public async stopAndRemoveContainer(containerId: string): Promise<void> {
    await this.service.stopAndRemoveContainer(containerId);
  }

  public async healthCheck(internalIp: string, port: number, path?: string): Promise<boolean> {
    return await this.service.healthCheck(internalIp, port, path);
  }

  public async proxy(
    req: FastifyRequest,
    reply: FastifyReply,
    target: { instanceId?: string; internalIp: string; internalPort: number }
  ): Promise<void> {
    const subpath = (req.params as any)['*'] || '';
    reply.hijack();
    await this.service.proxyRequest(req.raw, reply.raw, target, subpath);
  }
}

/**
 * Production HTTP Client.
 * Connects the Core Fastify Backend to the dedicated Challenge Gateway container over ctf_gateway_net.
 */
export class HttpChallengeGatewayClient implements IChallengeGatewayClient {
  private gatewayUrl: string;
  private gatewaySecret: string;

  constructor(gatewayUrl?: string, gatewaySecret?: string) {
    this.gatewayUrl = gatewayUrl || config.CHALLENGE_GATEWAY_URL;
    this.gatewaySecret = gatewaySecret || config.CHALLENGE_GATEWAY_SECRET;
  }

  private async requestJson(options: http.RequestOptions, body?: any): Promise<any> {
    const parsedUrl = new URL(this.gatewayUrl);
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: options.path,
          method: options.method || 'GET',
          headers: {
            'Content-Type': 'application/json',
            'x-gateway-secret': this.gatewaySecret,
            ...(options.headers || {}),
          },
          timeout: 10000,
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (res.statusCode && res.statusCode >= 400) {
                reject(new Error(parsed.error || parsed.message || `Gateway HTTP ${res.statusCode}`));
              } else {
                resolve(parsed);
              }
            } catch {
              reject(new Error(`Failed to parse Gateway response: ${data}`));
            }
          });
        }
      );

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Gateway request timed out'));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  public async createAndStartInstance(dto: CreateInstanceDto): Promise<InstanceCreationResult> {
    const res = await this.requestJson(
      { path: '/internal/instances', method: 'POST' },
      dto
    );
    return res.result;
  }

  public async stopAndRemoveInstance(instanceId: string): Promise<void> {
    await this.requestJson({
      path: `/internal/instances/${encodeURIComponent(instanceId)}/stop`,
      method: 'POST',
    });
  }

  public async inspectInstance(instanceId: string): Promise<ContainerInspection | null> {
    const res = await this.requestJson({
      path: `/internal/instances/${encodeURIComponent(instanceId)}/inspect`,
      method: 'GET',
    });
    return res.info;
  }

  public async listManagedContainers(): Promise<ManagedContainerInfo[]> {
    const res = await this.requestJson({
      path: '/internal/containers/managed',
      method: 'GET',
    });
    return res.containers || [];
  }

  public async stopAndRemoveContainer(containerId: string): Promise<void> {
    await this.requestJson({
      path: `/internal/containers/${encodeURIComponent(containerId)}`,
      method: 'DELETE',
    });
  }

  public async healthCheck(internalIp: string, port: number, path?: string): Promise<boolean> {
    return new Promise((resolve) => {
      const parsedUrl = new URL(this.gatewayUrl);
      const req = http.request(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: '/health',
          method: 'GET',
          timeout: 2000,
        },
        (res) => {
          resolve(res.statusCode === 200);
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

  public async proxy(
    req: FastifyRequest,
    reply: FastifyReply,
    target: { instanceId?: string; internalIp: string; internalPort: number }
  ): Promise<void> {
    const subpath = (req.params as any)['*'] || '';
    const parsedUrl = new URL(this.gatewayUrl);
    reply.hijack();

    return new Promise((resolve) => {
      let rawQuery = '';
      const reqUrl = req.raw.url || '';
      const qIndex = reqUrl.indexOf('?');
      if (qIndex !== -1) {
        rawQuery = reqUrl.substring(qIndex);
        const hashIndex = rawQuery.indexOf('#');
        if (hashIndex !== -1) {
          rawQuery = rawQuery.substring(0, hashIndex);
        }
      }

      const cleanSubpath = subpath.replace(/^\//, '').split('#')[0];
      const targetInstance = target.instanceId || `${target.internalIp}_${target.internalPort}`;
      const gatewayPath = `/proxy/${targetInstance}/${cleanSubpath}${rawQuery}`;

      const headers: Record<string, any> = {
        ...req.headers,
        'x-gateway-secret': this.gatewaySecret,
      };
      delete headers['host'];

      const proxyReq = http.request(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: gatewayPath,
          method: req.raw.method,
          headers,
          timeout: 10000,
        },
        (proxyRes) => {
          reply.raw.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
          proxyRes.pipe(reply.raw);
          proxyRes.on('end', () => resolve());
        }
      );

      proxyReq.on('error', (err) => {
        logger.error({ err: err.message }, 'Gateway proxy dispatch error');
        if (!reply.raw.headersSent) {
          reply.raw.writeHead(502, { 'Content-Type': 'application/json' });
          reply.raw.end(JSON.stringify({
            statusCode: 502,
            error: 'BAD_GATEWAY',
            message: 'Challenge gateway unreachable',
          }));
        }
        resolve();
      });

      proxyReq.on('timeout', () => {
        proxyReq.destroy();
        if (!reply.raw.headersSent) {
          reply.raw.writeHead(504, { 'Content-Type': 'application/json' });
          reply.raw.end(JSON.stringify({
            statusCode: 504,
            error: 'GATEWAY_TIMEOUT',
            message: 'Challenge gateway timed out',
          }));
        }
        resolve();
      });

      req.raw.pipe(proxyReq);
    });
  }
}

// Active singleton instance of the gateway client
let activeGatewayService = new ChallengeGatewayService();
const useDedicatedGateway =
  process.env.NODE_ENV !== 'test' &&
  Boolean(process.env.CHALLENGE_GATEWAY_URL && process.env.CHALLENGE_GATEWAY_SECRET);
let activeGatewayClient: IChallengeGatewayClient = useDedicatedGateway
  ? new HttpChallengeGatewayClient(
      process.env.CHALLENGE_GATEWAY_URL,
      process.env.CHALLENGE_GATEWAY_SECRET
    )
  : new DirectChallengeGatewayClient(activeGatewayService);

export function getChallengeGatewayClient(): IChallengeGatewayClient {
  return activeGatewayClient;
}

export function setChallengeGatewayClient(client: IChallengeGatewayClient): void {
  activeGatewayClient = client;
}

export function getChallengeGatewayService(): ChallengeGatewayService {
  return activeGatewayService;
}

export function setChallengeGatewayService(service: ChallengeGatewayService): void {
  activeGatewayService = service;
  activeGatewayClient = new DirectChallengeGatewayClient(service);
}
