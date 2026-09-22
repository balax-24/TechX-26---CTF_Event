import { describe, it, expect } from 'vitest';
import {
  hashFlag,
  verifyFlag,
  generateTeamHmacFlag,
  normalizeFlag,
} from '../../src/utils/flags.js';

describe('Flag Cryptographic Operations', () => {
  const salt = 'techx_test_salt_2026';

  it('normalizes flag by trimming whitespace', () => {
    expect(normalizeFlag('  TECHX{flag_here}  \n')).toBe('TECHX{flag_here}');
  });

  it('correctly hashes and verifies static flags', () => {
    const rawFlag = 'TECHX{sql_injection_bypass_master}';
    const flagHash = hashFlag(rawFlag, salt);

    expect(flagHash).toBeDefined();
    expect(flagHash).toHaveLength(64); // SHA-256 hex

    // Correct flag
    const isCorrect = verifyFlag(rawFlag, flagHash, { salt });
    expect(isCorrect).toBe(true);

    // Correct flag with whitespace
    const isCorrectTrimmed = verifyFlag(`  ${rawFlag}  `, flagHash, { salt });
    expect(isCorrectTrimmed).toBe(true);

    // Incorrect flag
    const isWrong = verifyFlag('TECHX{wrong_flag}', flagHash, { salt });
    expect(isWrong).toBe(false);
  });

  it('generates unique and deterministic dynamic HMAC flags per team', () => {
    const secret = 'super_secret_challenge_key';
    const teamA = 'team-uuid-1111';
    const teamB = 'team-uuid-2222';

    const flagA1 = generateTeamHmacFlag(secret, teamA);
    const flagA2 = generateTeamHmacFlag(secret, teamA);
    const flagB = generateTeamHmacFlag(secret, teamB);

    expect(flagA1).toBe(flagA2); // Deterministic
    expect(flagA1).not.toBe(flagB); // Team-isolated
    expect(flagA1.startsWith('TECHX{')).toBe(true);
    expect(flagA1.endsWith('}')).toBe(true);
  });

  it('verifies dynamic HMAC flags accurately', () => {
    const secret = 'super_secret_challenge_key';
    const teamId = 'team-uuid-1111';
    const validDynamicFlag = generateTeamHmacFlag(secret, teamId);

    const isMatch = verifyFlag(validDynamicFlag, '', {
      isDynamicHmac: true,
      hmacSecret: secret,
      teamId,
    });
    expect(isMatch).toBe(true);

    // Attempting to submit another team's flag fails
    const rivalFlag = generateTeamHmacFlag(secret, 'team-uuid-rival');
    const isRivalMatch = verifyFlag(rivalFlag, '', {
      isDynamicHmac: true,
      hmacSecret: secret,
      teamId,
    });
    expect(isRivalMatch).toBe(false);
  });
});
