import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { config } from '../config/env.js';
import * as schema from './schema.js';
import { logger } from '../utils/logger.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  min: config.DB_POOL_MIN,
  max: config.DB_POOL_MAX,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle PostgreSQL client');
});

export const db = drizzle(pool, { schema });

export async function checkDatabaseHealth(): Promise<{
  status: 'healthy' | 'unhealthy';
  latencyMs?: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      const latencyMs = Date.now() - start;
      return { status: 'healthy', latencyMs };
    } finally {
      client.release();
    }
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Database healthcheck failed');
    return { status: 'unhealthy', error: 'database_unavailable' };
  }
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
  logger.info('PostgreSQL connection pool closed');
}
