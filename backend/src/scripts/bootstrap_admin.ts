import { eq, or } from 'drizzle-orm';
import { db, pool } from '../db/index.js';
import { users, auditLogs } from '../db/schema.js';
import { hashPassword } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';

export interface BootstrapAdminOptions {
  username?: string;
  email?: string;
  password?: string;
}

export async function bootstrapAdmin(options?: BootstrapAdminOptions): Promise<{
  created: boolean;
  userId?: string;
  username: string;
  email: string;
}> {
  const username = options?.username || process.env.ADMIN_USERNAME;
  const email = options?.email || process.env.ADMIN_EMAIL;
  const password = options?.password || process.env.ADMIN_PASSWORD;

  if (!username || !email || !password) {
    throw new Error(
      'Admin bootstrap requires ADMIN_USERNAME, ADMIN_EMAIL, and ADMIN_PASSWORD (via env or arguments)'
    );
  }

  if (password.length < 12) {
    throw new Error('Admin bootstrap password must be at least 12 characters long');
  }

  if (username.length < 3 || username.length > 50) {
    throw new Error('Admin bootstrap username must be between 3 and 50 characters');
  }

  // Check if admin user already exists
  const existingUsers = await db
    .select()
    .from(users)
    .where(or(eq(users.username, username), eq(users.email, email)))
    .limit(1);

  if (existingUsers.length > 0) {
    const existing = existingUsers[0];
    logger.info({ username: existing.username, role: existing.role }, 'Admin user already exists — idempotent skip');
    return {
      created: false,
      userId: existing.id,
      username: existing.username,
      email: existing.email,
    };
  }

  // Hash password using OWASP Argon2id parameters
  const passwordHash = await hashPassword(password);

  const [newUser] = await db
    .insert(users)
    .values({
      username,
      email,
      passwordHash,
      role: 'superadmin',
      isActive: true,
    })
    .returning();

  // Audit log entry (sanitized: password is strictly excluded)
  await db.insert(auditLogs).values({
    actorId: newUser.id,
    actorRole: 'system',
    actorIp: '127.0.0.1',
    action: 'admin_bootstrap',
    entityType: 'user',
    entityId: newUser.id,
    reason: 'Initial platform administrator provisioning',
    detailsJson: {
      username: newUser.username,
      email: newUser.email,
      role: newUser.role,
    },
  });

  logger.info({ username: newUser.username, role: newUser.role }, 'Initial superadmin account provisioned successfully');

  return {
    created: true,
    userId: newUser.id,
    username: newUser.username,
    email: newUser.email,
  };
}

// Standalone execution handler
if (process.argv[1] && (process.argv[1].endsWith('bootstrap_admin.ts') || process.argv[1].endsWith('bootstrap_admin.js'))) {
  bootstrapAdmin()
    .then((result) => {
      console.log(`[✓] Bootstrap result: ${result.created ? 'CREATED' : 'ALREADY EXISTS'} (User: ${result.username})`);
      return pool.end();
    })
    .catch((err) => {
      console.error(`[✗] Bootstrap failed: ${err.message}`);
      pool.end().finally(() => process.exit(1));
    });
}
