import { hash, verify } from '@node-rs/argon2';
import { randomBytes, createHash, timingSafeEqual } from 'crypto';

// OWASP Recommended parameters for Argon2id
const ARGON2_OPTIONS = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,       // 2 iterations
  parallelism: 1,    // 1 thread
};

/**
 * Hashes a plaintext password using Argon2id with OWASP-recommended parameters.
 */
export async function hashPassword(password: string): Promise<string> {
  return await hash(password, ARGON2_OPTIONS);
}

/**
 * Verifies a plaintext password against an Argon2id hash in constant time.
 */
export async function verifyPassword(hashString: string, password: string): Promise<boolean> {
  try {
    return await verify(hashString, password);
  } catch {
    return false;
  }
}

/**
 * Generates a high-entropy, human-readable team invite code.
 * Format: TECHX-XXXX-XXXX (e.g. TECHX-7K9M-X2P4)
 */
export function generateInviteCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Excludes ambiguous chars like 0, O, 1, I
  const bytes = randomBytes(8);
  let part1 = '';
  let part2 = '';

  for (let i = 0; i < 4; i++) {
    part1 += chars[bytes[i] % chars.length];
    part2 += chars[bytes[i + 4] % chars.length];
  }

  return `TECHX-${part1}-${part2}`;
}

/**
 * Produces a SHA-256 hash of an invite code for database storage.
 */
export function hashInviteCode(code: string): string {
  const normalized = code.trim().toUpperCase();
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Performs a constant-time comparison between two strings to prevent timing attacks.
 */
export function timingSafeMatch(a: string, b: string): boolean {
  const bufA = createHash('sha256').update(a).digest();
  const bufB = createHash('sha256').update(b).digest();
  return timingSafeEqual(bufA, bufB);
}
