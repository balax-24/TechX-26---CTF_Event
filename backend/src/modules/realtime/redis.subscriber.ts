import { Redis } from 'ioredis';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { sseManager } from './sse.manager.js';
import {
  REDIS_LEADERBOARD_CHANNEL,
  SSE_EVENT_LEADERBOARD_UPDATE,
} from './realtime.constants.js';

/**
 * Dedicated Redis Pub/Sub Subscriber:
 * Acts as an ephemeral realtime transport receiving pub/sub messages from outbox workers.
 *
 * REALTIME ARCHITECTURE:
 * PostgreSQL transactional outbox
 *         ↓ (durable event)
 * Redis Pub/Sub
 *         ↓ (ephemeral realtime transport)
 * SSE
 *
 * NOTE: Redis Pub/Sub does not provide durable message queuing or persistent replay.
 * Disconnected clients recover by fetching the authoritative PostgreSQL leaderboard snapshot.
 */
export class RedisSubscriber {
  private subscriberClient: Redis | null = null;
  private isRunning = false;

  /**
   * Starts dedicated Redis subscriber listening on leaderboard event channel.
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      this.subscriberClient = new Redis(config.REDIS_URL, {
        maxRetriesPerRequest: null, // Subscribers should keep reconnecting
        retryStrategy(times) {
          const delay = Math.min(times * 300, 3000);
          return delay;
        },
        lazyConnect: true,
      });

      this.subscriberClient.on('connect', () => {
        logger.info('Leaderboard Redis subscriber connected');
      });

      this.subscriberClient.on('error', (err) => {
        logger.error({ err: err.message }, 'Leaderboard Redis subscriber error');
      });

      this.subscriberClient.on('message', (channel, message) => {
        if (channel === REDIS_LEADERBOARD_CHANNEL) {
          this.handleLeaderboardEvent(message);
        }
      });

      await this.subscriberClient.connect();
      await this.subscriberClient.subscribe(REDIS_LEADERBOARD_CHANNEL);

      logger.info(
        { channel: REDIS_LEADERBOARD_CHANNEL },
        'Subscribed to leaderboard event channel'
      );
    } catch (err: any) {
      logger.error(
        { err: err.message },
        'Failed to initialize Redis subscriber'
      );
    }
  }

  /**
   * Handles inbound Redis message and fans out to connected SSE clients.
   */
  handleLeaderboardEvent(rawMessage: string): void {
    try {
      const eventData = JSON.parse(rawMessage);
      const eventId = eventData.eventId || undefined;

      sseManager.broadcast(
        SSE_EVENT_LEADERBOARD_UPDATE,
        eventData,
        eventId
      );

      logger.debug(
        {
          eventId,
          teamId: eventData.teamId,
          activeClients: sseManager.getConnectionCount(),
        },
        'Leaderboard event fanned out to SSE clients'
      );
    } catch (err: any) {
      logger.warn(
        { err: err.message },
        'Discarding malformed leaderboard event message from Redis'
      );
    }
  }

  /**
   * Stops the subscriber and closes Redis connection.
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.subscriberClient) {
      try {
        await this.subscriberClient.unsubscribe(REDIS_LEADERBOARD_CHANNEL);
        await this.subscriberClient.quit();
      } catch {
        // Ignore disconnect errors during teardown
      } finally {
        this.subscriberClient = null;
        logger.info('Leaderboard Redis subscriber stopped');
      }
    }
  }
}

export const redisSubscriber = new RedisSubscriber();
