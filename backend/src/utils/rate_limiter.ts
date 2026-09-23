import { getRedisClient } from '../cache/redis.js';
import { logger } from './logger.js';

// In-memory sliding window fallback when Redis is unavailable
interface MemoryBucket {
  timestamps: number[];
  lastAccessed: number;
}

export const MAX_MEMORY_STORE_CAPACITY = 10000;
const memoryStore = new Map<string, MemoryBucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  mode: 'redis' | 'memory_fallback';
  isFallback: boolean;
}

/**
 * Prunes expired or cold buckets when memoryStore reaches capacity.
 */
function pruneMemoryStore(now: number): void {
  // 1. Purge completely empty or expired buckets
  for (const [key, bucket] of memoryStore.entries()) {
    if (bucket.timestamps.length === 0 || now - bucket.lastAccessed > 300000) {
      memoryStore.delete(key);
    }
  }

  // 2. If still exceeding capacity, perform LRU eviction of oldest accessed buckets
  if (memoryStore.size >= MAX_MEMORY_STORE_CAPACITY) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, bucket] of memoryStore.entries()) {
      if (bucket.lastAccessed < oldestTime) {
        oldestTime = bucket.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      memoryStore.delete(oldestKey);
    }
  }
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

  // Fallback: Bounded in-memory sliding window
  if (memoryStore.size >= MAX_MEMORY_STORE_CAPACITY) {
    pruneMemoryStore(now);
  }

  let bucket = memoryStore.get(key);
  if (!bucket) {
    bucket = { timestamps: [], lastAccessed: now };
    memoryStore.set(key, bucket);
  }

  bucket.lastAccessed = now;

  // Prune expired timestamps
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

/**
 * Diagnostic / testing helper to inspect in-memory rate limiter store size.
 */
export function getMemoryRateLimiterSize(): number {
  return memoryStore.size;
}
