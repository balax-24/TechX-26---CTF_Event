import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { scoreEventOutbox } from '../../db/schema.js';
import { getRedisClient } from '../../cache/redis.js';
import { logger } from '../../utils/logger.js';
import {
  REDIS_LEADERBOARD_CHANNEL,
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_BATCH_SIZE,
  OUTBOX_POLL_INTERVAL_MS,
} from './realtime.constants.js';

/**
 * Transactional Outbox Worker:
 * Polls `score_event_outbox` for unpublished scoring events using `FOR UPDATE SKIP LOCKED`.
 *
 * REALTIME ARCHITECTURE:
 * PostgreSQL transactional outbox
 *         ↓ (durable event)
 * Redis Pub/Sub
 *         ↓ (ephemeral realtime transport)
 * SSE
 *
 * RECOVERY & IDEMPOTENCE:
 * - PostgreSQL provides durable publication attempts.
 * - Redis Pub/Sub is ephemeral realtime transport (no message persistence).
 * - Disconnected clients recover by fetching the authoritative PostgreSQL leaderboard snapshot.
 * - If worker crashes after Redis publish but before updating `published_at`, the event will be
 *   re-published on restart. Consumers handle duplicate event deliveries idempotently.
 */
export interface OutboxWorkerStats {
  publishedCount: number;
  publishFailures: number;
  retryCount: number;
  consecutiveFailures: number;
}

export class OutboxWorker {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private isRunning = false;
  private stats: OutboxWorkerStats = {
    publishedCount: 0,
    publishFailures: 0,
    retryCount: 0,
    consecutiveFailures: 0,
  };

  /**
   * Starts the background outbox polling loop.
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('Outbox worker started');
    this.scheduleNext(100); // initial tick
  }

  /**
   * Stops the worker cleanly.
   */
  stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    logger.info(
      {
        published: this.stats.publishedCount,
        failures: this.stats.publishFailures,
      },
      'Outbox worker stopped'
    );
  }

  /**
   * Immediate trigger invoked post-commit to deliver events without waiting for poll interval.
   */
  trigger(): void {
    if (!this.isRunning || this.isProcessing) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    setImmediate(() => {
      this.processOutboxBatch().catch((err) => {
        logger.error({ err: err.message }, 'Error in triggered outbox cycle');
      });
    });
  }

  /**
   * Schedules the next polling cycle.
   */
  private scheduleNext(delayMs = OUTBOX_POLL_INTERVAL_MS): void {
    if (!this.isRunning) return;
    this.timer = setTimeout(() => {
      this.processOutboxBatch()
        .catch((err) => {
          logger.error({ err: err.message }, 'Unexpected error in outbox polling cycle');
        })
        .finally(() => {
          this.scheduleNext(OUTBOX_POLL_INTERVAL_MS);
        });
    }, delayMs);
  }

  /**
   * Processes a batch of unpublished outbox events with row locking (SKIP LOCKED).
   */
  async processOutboxBatch(): Promise<number> {
    if (this.isProcessing) return 0;
    this.isProcessing = true;

    let processedCount = 0;

    try {
      // 1. Claim batch of pending events using FOR UPDATE SKIP LOCKED
      // Bounded retry filter: attempt_count < OUTBOX_MAX_ATTEMPTS
      // Exponential backoff check: last_attempt_at is null or older than 2^attempt_count * 250ms
      const claimedRows = await db.transaction(async (tx) => {
        const query = sql`
          SELECT id, event_id, event_type, team_id, challenge_id, points, team_score, payload, attempt_count
          FROM ${scoreEventOutbox}
          WHERE published_at IS NULL
            AND attempt_count < ${OUTBOX_MAX_ATTEMPTS}
            AND (
              last_attempt_at IS NULL
              OR last_attempt_at < NOW() - (POWER(2, attempt_count) * INTERVAL '250 milliseconds')
            )
          ORDER BY created_at ASC
          LIMIT ${OUTBOX_BATCH_SIZE}
          FOR UPDATE SKIP LOCKED
        `;

        const result = await tx.execute(query);
        const rows = (result.rows || []) as Array<{
          id: string;
          event_id: string;
          event_type: string;
          team_id: string;
          challenge_id: string | null;
          points: number;
          team_score: number;
          payload: any;
          attempt_count: number;
        }>;

        if (rows.length === 0) {
          return [];
        }

        // Increment attempt_count and update last_attempt_at atomically during claim
        const ids = rows.map((r) => r.id);
        await tx.execute(sql`
          UPDATE ${scoreEventOutbox}
          SET attempt_count = attempt_count + 1,
              last_attempt_at = NOW()
          WHERE id = ANY(${ids})
        `);

        return rows;
      });

      if (!claimedRows || claimedRows.length === 0) {
        return 0;
      }

      // 2. Publish each claimed event to Redis Pub/Sub
      const redis = getRedisClient();

      for (const row of claimedRows) {
        const payloadStr =
          typeof row.payload === 'string' ? row.payload : JSON.stringify(row.payload);

        try {
          await redis.publish(REDIS_LEADERBOARD_CHANNEL, payloadStr);

          // Mark published successfully
          await db
            .update(scoreEventOutbox)
            .set({
              publishedAt: sql`NOW()`,
              lastError: null,
            })
            .where(eq(scoreEventOutbox.id, row.id));

          this.stats.publishedCount++;
          this.stats.consecutiveFailures = 0;
          processedCount++;

          logger.debug(
            {
              eventId: row.event_id,
              eventType: row.event_type,
              teamId: row.team_id,
            },
            'Outbox event published to Redis'
          );
        } catch (publishErr: any) {
          this.stats.publishFailures++;
          this.stats.retryCount++;
          this.stats.consecutiveFailures++;

          logger.warn(
            {
              eventId: row.event_id,
              attempt: row.attempt_count + 1,
              err: publishErr.message,
            },
            'Failed to publish outbox event to Redis — will retry with backoff'
          );

          // Record error message on row for debugging
          await db
            .update(scoreEventOutbox)
            .set({
              lastError: publishErr.message,
            })
            .where(eq(scoreEventOutbox.id, row.id));
        }
      }
    } catch (err: any) {
      // Catch DB failure or general batch processing error
      logger.error({ err: err.message }, 'Failed to process outbox batch');
    } finally {
      this.isProcessing = false;
    }

    return processedCount;
  }

  /**
   * Diagnostic helper to get current worker metrics.
   */
  getStats(): OutboxWorkerStats {
    return { ...this.stats };
  }

  /**
   * Resets internal metrics (useful for testing).
   */
  resetStats(): void {
    this.stats = {
      publishedCount: 0,
      publishFailures: 0,
      retryCount: 0,
      consecutiveFailures: 0,
    };
  }
}

export const outboxWorker = new OutboxWorker();
