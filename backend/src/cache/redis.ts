import { Redis } from 'ioredis';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 200, 2000);
        return delay;
      },
      lazyConnect: true,
      enableReadyCheck: true,
    });

    redisClient.on('connect', () => {
      logger.info('Connected to Redis');
    });

    redisClient.on('error', (err) => {
      logger.error({ err: err.message }, 'Redis client connection error');
    });
  }

  return redisClient;
}

export async function checkRedisHealth(): Promise<{
  status: 'healthy' | 'unhealthy';
  latencyMs?: number;
  error?: string;
}> {
  const client = getRedisClient();
  const start = Date.now();
  try {
    if (client.status === 'wait') {
      await client.connect();
    }
    const pong = await client.ping();
    if (pong === 'PONG') {
      return { status: 'healthy', latencyMs: Date.now() - start };
    }
    return { status: 'unhealthy', error: 'unexpected_ping_response' };
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Redis healthcheck failed');
    return { status: 'unhealthy', error: 'redis_unavailable' };
  }
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis connection closed');
  }
}
