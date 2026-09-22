import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './index.js';
import { logger } from '../utils/logger.js';
import * as path from 'path';

async function runMigrations() {
  try {
    logger.info('Running database migrations...');
    const migrationsFolder = path.resolve(process.cwd(), 'src/db/migrations');
    await migrate(db, { migrationsFolder });
    logger.info('Database migrations applied successfully');
  } catch (err) {
    logger.error({ err }, 'Failed to run database migrations');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
