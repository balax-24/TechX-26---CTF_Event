import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './index.js';
import { logger } from '../utils/logger.js';
import * as path from 'path';
import * as fs from 'fs';

export async function runMigrations(): Promise<void> {
  try {
    logger.info('Resolving database migrations folder...');

    const currentDir = typeof __dirname !== 'undefined' ? __dirname : path.resolve(process.cwd(), 'src/db');

    const candidateFolders = [
      path.resolve(currentDir, 'migrations'),
      path.resolve(process.cwd(), 'dist/db/migrations'),
      path.resolve(process.cwd(), 'src/db/migrations'),
      path.resolve(process.cwd(), 'backend/src/db/migrations'),
    ];

    const migrationsFolder = candidateFolders.find((folder) => fs.existsSync(folder));

    if (!migrationsFolder) {
      throw new Error(`Database migrations directory not found in candidate paths: ${candidateFolders.join(', ')}`);
    }

    logger.info({ migrationsFolder }, 'Applying database migrations...');
    await migrate(db, { migrationsFolder });
    logger.info('Database migrations applied successfully');
  } catch (err: any) {
    logger.error({ err: err?.message || err }, 'Failed to run database migrations');
    process.exitCode = 1;
    throw err;
  } finally {
    await pool.end();
  }
}

// Auto-run if executed as standalone script
if (process.argv[1] && (process.argv[1].endsWith('migrate.ts') || process.argv[1].endsWith('migrate.js'))) {
  runMigrations().catch(() => {
    process.exit(1);
  });
}
