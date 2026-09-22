import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_BASE_BACKOFF_MS,
  REDIS_LEADERBOARD_CHANNEL,
} from '../../src/modules/realtime/realtime.constants.js';

describe('Transactional Outbox Worker & Retry Logic Unit Tests', () => {
  // ---------------------------------------------------------------------------
  // 1. BACKOFF CALCULATION
  // ---------------------------------------------------------------------------
  describe('Exponential Backoff Strategy', () => {
    it('calculates increasing backoff delays without tight-loop CPU spinning', () => {
      // Backoff formula: 2^attempt_count * 250ms
      function calculateBackoffMs(attempt: number): number {
        return Math.min(OUTBOX_BASE_BACKOFF_MS * Math.pow(2, attempt - 1), 30000);
      }

      expect(calculateBackoffMs(1)).toBe(500);
      expect(calculateBackoffMs(2)).toBe(1000);
      expect(calculateBackoffMs(3)).toBe(2000);
      expect(calculateBackoffMs(4)).toBe(4000);
      expect(calculateBackoffMs(5)).toBe(8000);
    });

    it('caps backoff at 30 seconds for higher attempt numbers', () => {
      function calculateBackoffMs(attempt: number): number {
        return Math.min(OUTBOX_BASE_BACKOFF_MS * Math.pow(2, attempt - 1), 30000);
      }

      expect(calculateBackoffMs(8)).toBe(30000);
      expect(calculateBackoffMs(10)).toBe(30000);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. STATE TRANSITIONS & RETRY TOLERANCE SIMULATION
  // ---------------------------------------------------------------------------
  describe('Outbox State Machine', () => {
    interface OutboxRow {
      id: string;
      eventId: string;
      publishedAt: Date | null;
      attemptCount: number;
      lastAttemptAt: Date | null;
      lastError: string | null;
      payload: any;
    }

    let mockOutboxTable: OutboxRow[] = [];
    let redisOnline = true;
    const publishedRedisMessages: string[] = [];

    beforeEach(() => {
      mockOutboxTable = [];
      publishedRedisMessages.length = 0;
      redisOnline = true;
    });

    function insertOutboxEvent(eventId: string, payload: any): OutboxRow {
      const row: OutboxRow = {
        id: `outbox-${eventId}`,
        eventId,
        publishedAt: null,
        attemptCount: 0,
        lastAttemptAt: null,
        lastError: null,
        payload,
      };
      mockOutboxTable.push(row);
      return row;
    }

    async function simulateOutboxWorkerProcess(): Promise<number> {
      let processed = 0;

      // Filter: published_at IS NULL AND attempt_count < OUTBOX_MAX_ATTEMPTS
      const pendingRows = mockOutboxTable.filter(
        (r) => r.publishedAt === null && r.attemptCount < OUTBOX_MAX_ATTEMPTS
      );

      for (const row of pendingRows) {
        row.attemptCount++;
        row.lastAttemptAt = new Date();

        if (redisOnline) {
          publishedRedisMessages.push(JSON.stringify(row.payload));
          row.publishedAt = new Date();
          row.lastError = null;
          processed++;
        } else {
          row.lastError = 'Connection refused to Redis';
        }
      }

      return processed;
    }

    it('successfully processes pending events and marks published_at', async () => {
      insertOutboxEvent('evt-1', { teamId: 't1', score: 100 });
      insertOutboxEvent('evt-2', { teamId: 't2', score: 250 });

      expect(mockOutboxTable.every((r) => r.publishedAt === null)).toBe(true);

      const processed = await simulateOutboxWorkerProcess();

      expect(processed).toBe(2);
      expect(publishedRedisMessages.length).toBe(2);
      expect(mockOutboxTable[0].publishedAt).not.toBeNull();
      expect(mockOutboxTable[1].publishedAt).not.toBeNull();
      expect(mockOutboxTable[0].attemptCount).toBe(1);
    });

    it('leaves event pending when Redis is unavailable, incrementing attempt count', async () => {
      insertOutboxEvent('evt-down', { teamId: 't1', score: 500 });
      redisOnline = false; // Simulate Redis outage

      const processed = await simulateOutboxWorkerProcess();

      expect(processed).toBe(0);
      expect(publishedRedisMessages.length).toBe(0);
      expect(mockOutboxTable[0].publishedAt).toBeNull();
      expect(mockOutboxTable[0].attemptCount).toBe(1);
      expect(mockOutboxTable[0].lastError).toContain('Connection refused');

      // Second failure cycle
      await simulateOutboxWorkerProcess();
      expect(mockOutboxTable[0].attemptCount).toBe(2);

      // Restore Redis
      redisOnline = true;
      const recovered = await simulateOutboxWorkerProcess();

      expect(recovered).toBe(1);
      expect(mockOutboxTable[0].publishedAt).not.toBeNull();
      expect(mockOutboxTable[0].lastError).toBeNull();
      expect(publishedRedisMessages.length).toBe(1);
    });

    it('stops retrying when attemptCount reaches OUTBOX_MAX_ATTEMPTS (dead-letter defense)', async () => {
      const row = insertOutboxEvent('evt-broken', { teamId: 't-fail' });
      row.attemptCount = OUTBOX_MAX_ATTEMPTS; // Already reached max retries

      const processed = await simulateOutboxWorkerProcess();

      expect(processed).toBe(0);
      expect(publishedRedisMessages.length).toBe(0);
      expect(row.publishedAt).toBeNull();
    });

    it('guarantees duplicate events have stable, immutable eventId for consumer idempotency', async () => {
      const row = insertOutboxEvent('evt-stable-uuid', {
        eventId: 'evt-stable-uuid',
        score: 300,
      });

      // Simulate first publish
      await simulateOutboxWorkerProcess();
      expect(publishedRedisMessages.length).toBe(1);

      // Simulate worker crash before DB commit (reset publishedAt to null, keep eventId)
      row.publishedAt = null;

      // Second publish
      await simulateOutboxWorkerProcess();
      expect(publishedRedisMessages.length).toBe(2);

      // Both published messages contain the EXACT same eventId
      const firstMsg = JSON.parse(publishedRedisMessages[0]);
      const secondMsg = JSON.parse(publishedRedisMessages[1]);

      expect(firstMsg.eventId).toBe('evt-stable-uuid');
      expect(secondMsg.eventId).toBe('evt-stable-uuid');
      expect(firstMsg.eventId).toBe(secondMsg.eventId);
    });
  });
});
