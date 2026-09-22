import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  checkRateLimit,
  clearMemoryRateLimiter,
} from '../../src/utils/rate_limiter.js';
import * as redisModule from '../../src/cache/redis.js';

describe('Sliding-Window Rate Limiter & Fallback Semantics', () => {
  beforeEach(() => {
    clearMemoryRateLimiter();
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. IN-MEMORY FALLBACK PATH (Degraded Mode)
  // ---------------------------------------------------------------------------
  it('1. Operates in in-memory fallback mode when Redis is offline', async () => {
    // Mock getRedisClient to simulate offline / closed status
    vi.spyOn(redisModule, 'getRedisClient').mockReturnValue({
      status: 'close',
    } as any);

    const key = `test_inmem_${Date.now()}`;
    const res = await checkRateLimit(key, 5, 10000);

    expect(res.allowed).toBe(true);
    expect(res.remaining).toBe(4);
    expect(res.isFallback).toBe(true);
    expect(res.mode).toBe('memory_fallback');
  });

  // ---------------------------------------------------------------------------
  // 2. REDIS PATH (Authoritative Distributed Limiter)
  // ---------------------------------------------------------------------------
  it('2. Uses authoritative Redis pipeline when Redis client is ready', async () => {
    let zcardCount = 1;
    const mockMulti = {
      zremrangebyscore: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      pexpire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockImplementation(async () => [
        [null, 0], // zremrangebyscore
        [null, 1], // zadd
        [null, zcardCount], // zcard
        [null, 1], // pexpire
      ]),
    };

    const mockRedis = {
      status: 'ready',
      multi: vi.fn().mockReturnValue(mockMulti),
    };

    vi.spyOn(redisModule, 'getRedisClient').mockReturnValue(mockRedis as any);

    const key = `test_redis_${Date.now()}`;
    const res1 = await checkRateLimit(key, 3, 5000);

    expect(mockRedis.multi).toHaveBeenCalled();
    expect(mockMulti.zremrangebyscore).toHaveBeenCalled();
    expect(mockMulti.zadd).toHaveBeenCalled();
    expect(mockMulti.zcard).toHaveBeenCalled();
    expect(mockMulti.pexpire).toHaveBeenCalled();

    expect(res1.allowed).toBe(true);
    expect(res1.remaining).toBe(2);
    expect(res1.isFallback).toBe(false);
    expect(res1.mode).toBe('redis');

    // Simulate exceeding limit via Redis zcard
    zcardCount = 4;
    const res2 = await checkRateLimit(key, 3, 5000);
    expect(res2.allowed).toBe(false);
    expect(res2.remaining).toBe(0);
    expect(res2.isFallback).toBe(false);
    expect(res2.mode).toBe('redis');
  });

  // ---------------------------------------------------------------------------
  // 3. REPEATED REQUESTS (Quota Exhaustion)
  // ---------------------------------------------------------------------------
  it('3. Enforces quota limit on repeated requests and rejects subsequent attempts', async () => {
    vi.spyOn(redisModule, 'getRedisClient').mockReturnValue({ status: 'close' } as any);

    const key = `test_repeated_${Date.now()}`;
    const maxRequests = 3;
    const windowMs = 5000;

    // 1st request -> allowed (remaining: 2)
    const r1 = await checkRateLimit(key, maxRequests, windowMs);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    // 2nd request -> allowed (remaining: 1)
    const r2 = await checkRateLimit(key, maxRequests, windowMs);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    // 3rd request -> allowed (remaining: 0)
    const r3 = await checkRateLimit(key, maxRequests, windowMs);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);

    // 4th request -> BLOCKED (remaining: 0)
    const r4 = await checkRateLimit(key, maxRequests, windowMs);
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);

    // 5th request -> Still BLOCKED
    const r5 = await checkRateLimit(key, maxRequests, windowMs);
    expect(r5.allowed).toBe(false);
    expect(r5.remaining).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 4. RESET & WINDOW EXPIRY
  // ---------------------------------------------------------------------------
  it('4. Prunes expired requests and replenishes quota when window elapses', async () => {
    vi.spyOn(redisModule, 'getRedisClient').mockReturnValue({ status: 'close' } as any);

    const key = `test_expiry_${Date.now()}`;
    const maxRequests = 2;
    const windowMs = 50; // short 50ms window

    // Exhaust quota
    await checkRateLimit(key, maxRequests, windowMs);
    const blocked = await checkRateLimit(key, maxRequests, windowMs);
    expect(blocked.remaining).toBe(0);

    // A 3rd request immediately is blocked
    const immediate = await checkRateLimit(key, maxRequests, windowMs);
    expect(immediate.allowed).toBe(false);

    // Wait 60ms for the sliding window to elapse
    await new Promise((resolve) => setTimeout(resolve, 60));

    // After window elapses, expired entries are pruned -> quota replenishes!
    const refreshed = await checkRateLimit(key, maxRequests, windowMs);
    expect(refreshed.allowed).toBe(true);
    expect(refreshed.remaining).toBe(1);
  });
});
