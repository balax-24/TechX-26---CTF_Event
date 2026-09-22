import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://techx_ctf_user:techx_ctf_secure_password_2026@localhost:5432/techx_ctf_db',
  },
  verbose: true,
  strict: true,
});
