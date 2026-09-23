import { z } from 'zod';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from workspace root or current directory
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DEPLOYMENT_MODE: z.enum(['lan', 'production']).default('lan'),
  
  APP_HOST: z.string().default('0.0.0.0'),
  APP_PORT: z.coerce.number().default(4000),

  PUBLIC_HOST: z.string().default('localhost'),
  PUBLIC_PORT: z.coerce.number().default(80),
  PUBLIC_PROTOCOL: z.enum(['http', 'https']).default('http'),

  CORS_ORIGIN: z.string().default('http://localhost:5173,http://localhost:4000,http://localhost,http://127.0.0.1'),

  CHALLENGE_GATEWAY_URL: z.string().default('http://127.0.0.1:5000'),
  CHALLENGE_GATEWAY_SECRET: z.string().min(16).default('techx_gateway_secure_internal_token_2026'),

  JWT_SECRET: z.string().min(16).default('super_secret_jwt_key_techx_ctf_change_me_in_production_32chars!'),
  JWT_EXPIRES_IN: z.string().default('24h'),
  COOKIE_SECRET: z.string().min(16).default('super_secret_cookie_signing_key_techx_ctf_32chars_minimum!'),

  DATABASE_URL: z.string().default('postgresql://techx_ctf_user:techx_ctf_secure_password_2026@localhost:5432/techx_ctf_db'),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_USER: z.string().default('techx_ctf_user'),
  DB_PASSWORD: z.string().default('techx_ctf_secure_password_2026'),
  DB_NAME: z.string().default('techx_ctf_db'),
  DB_POOL_MIN: z.coerce.number().default(5),
  DB_POOL_MAX: z.coerce.number().default(25),

  REDIS_URL: z.string().default('redis://:techx_redis_secure_password_2026@localhost:6379/0'),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().default('techx_redis_secure_password_2026'),

  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  FLAG_SUBMIT_LIMIT_PER_WINDOW: z.coerce.number().default(5),
  FLAG_SUBMIT_WINDOW_MS: z.coerce.number().default(30000),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  TEAM_MAX_MEMBERS: z.coerce.number().default(4),
  COMPETITION_STATE: z.enum(['paused', 'active', 'frozen', 'ended']).default('active'),
  FLAG_PREFIX: z.string().default('TECHX{'),
  FLAG_SALT: z.string().default('techx_ctf_2026_super_secret_flag_salt'),
});

export type Env = z.infer<typeof envSchema>;

function loadConfig(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment configuration:', JSON.stringify(result.error.format(), null, 2));
    throw new Error('Environment configuration validation failed');
  }
  return result.data;
}

export const config = loadConfig();
