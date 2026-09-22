import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  generateInviteCode,
  hashInviteCode,
  timingSafeMatch,
} from '../../src/utils/crypto.js';

describe('Cryptographic Utilities', () => {
  it('should hash and verify passwords using Argon2id', async () => {
    const plaintext = 'TechX_CTF_P@ssw0rd!2026';
    const hash = await hashPassword(plaintext);

    expect(hash).toBeDefined();
    expect(hash.startsWith('$argon2id$')).toBe(true);

    const isMatch = await verifyPassword(hash, plaintext);
    expect(isMatch).toBe(true);

    const isWrongMatch = await verifyPassword(hash, 'wrong_password_attempt');
    expect(isWrongMatch).toBe(false);
  });

  it('should generate valid human-readable invite codes', () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^TECHX-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
  });

  it('should produce consistent invite code hashes', () => {
    const code = 'TECHX-ABCD-1234';
    const hash1 = hashInviteCode(code);
    const hash2 = hashInviteCode(' techx-abcd-1234 '); // case and whitespace insensitive
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex string
  });

  it('should perform constant-time comparisons accurately', () => {
    expect(timingSafeMatch('TECHX{correct_flag}', 'TECHX{correct_flag}')).toBe(true);
    expect(timingSafeMatch('TECHX{correct_flag}', 'TECHX{wrong_flag}')).toBe(false);
    expect(timingSafeMatch('TECHX{flag}', 'TECHX{flag_longer}')).toBe(false);
  });
});
