import { getRedisClient } from '../cache/redis.js';
import { logger } from './logger.js';

// In-memory sliding window fallback when Redis is unavailable
interface MemoryBucket {
  timestamps: number[];
}
const memoryStore = new Map<string, MemoryBucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  mode: 'redis' | 'memory_fallback';
  isFallback: boolean;
}

/**
 * Sliding-window rate limiter.
 * Limits `key` to `maxRequests` per `windowMs`.
 *
 * Distributed Architecture Guarantee:
 * - When Redis is online: Uses Redis sorted sets (ZREMRANGEBYSCORE, ZADD, ZCARD, PEXPIRE) as
 *   the authoritative distributed rate limiter across all horizontal nodes.
 * - When Redis is offline: Automatically degrades to an in-memory sliding-window store.
 *   Note: In-memory fallback is strictly single-instance; it does not provide distributed
 *   coordination across separate Node.js processes.
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - windowMs;

  try {
    const redis = getRedisClient();
    if (redis.status === 'ready' || redis.status === 'connect') {
      const redisKey = `ratelimit:${key}`;

      // Redis pipeline: prune old, add current, count window, set expire
      const multi = redis.multi();
      multi.zremrangebyscore(redisKey, 0, windowStart);
      multi.zadd(redisKey, now, `${now}-${Math.random()}`);
      multi.zcard(redisKey);
      multi.pexpire(redisKey, windowMs);

      const results = await multi.exec();
      const count = (results?.[2]?.[1] as number) || 0;

      const allowed = count <= maxRequests;
      const remaining = Math.max(0, maxRequests - count);

      return {
        allowed,
        remaining,
        mode: 'redis',
        isFallback: false,
      };
    }
  } catch (err: any) {
    logger.warn(
      { err: err.message, key },
      'Redis rate limiter unavailable — fallback to in-memory store (degraded single-instance mode)'
    );
  }

  // Fallback: In-memory sliding window
  let bucket = memoryStore.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    memoryStore.set(key, bucket);
  }

  // Prune expired
  bucket.timestamps = bucket.timestamps.filter((ts) => ts > windowStart);
  bucket.timestamps.push(now);

  const allowed = bucket.timestamps.length <= maxRequests;
  const remaining = Math.max(0, maxRequests - bucket.timestamps.length);

  return {
    allowed,
    remaining,
    mode: 'memory_fallback',
    isFallback: true,
  };
}

/**
 * Diagnostic / testing helper to clear the in-memory rate limiter store.
 */
export function clearMemoryRateLimiter(): void {
  memoryStore.clear();
}
