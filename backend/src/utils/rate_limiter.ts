import { getRedisClient } from '../cache/redis.js';
import { logger } from './logger.js';

// In-memory sliding window fallback when Redis is unavailable
interface MemoryBucket {
  timestamps: number[];
}
const memoryStore = new Map<string, MemoryBucket>();

/**
 * Sliding-window rate limiter.
 * Limits `key` to `maxRequests` per `windowMs`.
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<{ allowed: boolean; remaining: number }> {
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

      return { allowed, remaining };
    }
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Redis rate limiter fallback to in-memory store');
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

  return { allowed, remaining };
}
