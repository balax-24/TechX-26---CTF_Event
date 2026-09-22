import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { config } from '../config/env.js';

/**
 * Normalizes a flag submission: trims whitespace.
 */
export function normalizeFlag(flag: string): string {
  return flag.trim();
}

/**
 * Computes a salted SHA-256 hash of a static flag for secure storage.
 */
export function hashFlag(flag: string, salt: string = config.FLAG_SALT): string {
  const normalized = normalizeFlag(flag);
  return createHash('sha256').update(`${salt}:${normalized}`).digest('hex');
}

/**
 * Generates a deterministic dynamic flag for a specific team using HMAC-SHA256.
 * Format: TECHX{<hmac_hash_segment>}
 */
export function generateTeamHmacFlag(secretKey: string, teamId: string): string {
  const hmac = createHmac('sha256', secretKey);
  hmac.update(teamId);
  const token = hmac.digest('hex').substring(0, 24);
  return `${config.FLAG_PREFIX}${token}}`;
}

/**
 * Verifies a submitted flag against either a stored static hash or a team-specific dynamic HMAC.
 * Uses constant-time buffer comparison to eliminate side-channel timing attacks.
 */
export function verifyFlag(
  submittedFlag: string,
  targetFlagHash: string,
  options?: {
    isDynamicHmac?: boolean;
    hmacSecret?: string;
    teamId?: string;
    salt?: string;
  }
): boolean {
  const normalized = normalizeFlag(submittedFlag);

  if (options?.isDynamicHmac && options.hmacSecret && options.teamId) {
    const expectedDynamicFlag = generateTeamHmacFlag(options.hmacSecret, options.teamId);
    const submittedHash = createHash('sha256').update(normalized).digest();
    const expectedHash = createHash('sha256').update(expectedDynamicFlag).digest();
    return timingSafeEqual(submittedHash, expectedHash);
  }

  // Static flag verification:
  const salt = options?.salt || config.FLAG_SALT;
  const computedHash = createHash('sha256').update(`${salt}:${normalized}`).digest('hex');

  const bufA = createHash('sha256').update(computedHash).digest();
  const bufB = createHash('sha256').update(targetFlagHash).digest();
  return timingSafeEqual(bufA, bufB);
}
