import { buildApp } from './app.js';
import { config } from './config/env.js';
import { logger } from './utils/logger.js';
import { closeDatabase } from './db/index.js';
import { closeRedis } from './cache/redis.js';
import { outboxWorker } from './modules/realtime/outbox.worker.js';
import { redisSubscriber } from './modules/realtime/redis.subscriber.js';
import { sseManager } from './modules/realtime/sse.manager.js';
import { instanceCleanupWorker } from './modules/dynamic_challenges/cleanup.worker.js';

async function startServer() {
  try {
    const app = await buildApp();
    const backgroundWorkersEnabled = process.env.ENABLE_BACKGROUND_WORKERS !== 'false';

    // 1. Initialize Real-Time Outbox Worker, Redis Subscriber, and Dynamic Challenge Cleanup Worker
    if (backgroundWorkersEnabled) {
      outboxWorker.start();
      await redisSubscriber.start();
      sseManager.startHeartbeat();
      instanceCleanupWorker.start();
    }

    const address = await app.listen({
      port: config.APP_PORT,
      host: config.APP_HOST,
    });

    logger.info(
      {
        address,
        port: config.APP_PORT,
        mode: config.DEPLOYMENT_MODE,
        env: config.NODE_ENV,
      },
      `🚀 TechX CTF 2026 Core Platform active at ${address}`
    );

    // Graceful Shutdown Signals
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
    for (const signal of signals) {
      process.on(signal, async () => {
        logger.warn({ signal }, 'Shutdown signal received, closing connections gracefully...');

        try {
          // 1. Stop real-time engine components and cleanup worker
          sseManager.closeAll();
          if (backgroundWorkersEnabled) {
            await redisSubscriber.stop();
            outboxWorker.stop();
            instanceCleanupWorker.stop();
          }

          // 2. Close HTTP server
          await app.close();
          logger.info('HTTP server closed');

          // 3. Close persistence pools
          await closeRedis();
          await closeDatabase();

          logger.info('All database & cache connections released successfully');
          process.exit(0);
        } catch (err) {
          logger.error({ err }, 'Error during graceful shutdown');
          process.exit(1);
        }
      });
    }
  } catch (err) {
    logger.fatal({ err }, 'Failed to start TechX CTF server');
    process.exit(1);
  }
}

startServer();
