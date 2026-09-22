import { buildApp } from './app.js';
import { config } from './config/env.js';
import { logger } from './utils/logger.js';
import { closeDatabase } from './db/index.js';
import { closeRedis } from './cache/redis.js';

async function startServer() {
  try {
    const app = await buildApp();

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
          await app.close();
          logger.info('HTTP server closed');

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
