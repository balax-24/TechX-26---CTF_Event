import { describe, it, expect } from 'vitest';
import { registerSchema, loginSchema } from '../../src/modules/auth/auth.schema.js';
import { createTeamSchema, joinTeamSchema } from '../../src/modules/teams/teams.schema.js';

describe('Validation Schemas', () => {
  describe('Register Schema', () => {
    it('accepts valid registration payloads', () => {
      const valid = registerSchema.safeParse({
        username: 'cyber_warrior',
        email: 'warrior@techxmadras.org',
        password: 'securePassword123!',
      });
      expect(valid.success).toBe(true);
    });

    it('rejects short usernames', () => {
      const invalid = registerSchema.safeParse({
        username: 'ab',
        email: 'test@example.com',
        password: 'securePassword123!',
      });
      expect(invalid.success).toBe(false);
    });

    it('rejects invalid characters in username', () => {
      const invalid = registerSchema.safeParse({
        username: 'user@hack<script>',
        email: 'test@example.com',
        password: 'securePassword123!',
      });
      expect(invalid.success).toBe(false);
    });

    it('rejects invalid emails', () => {
      const invalid = registerSchema.safeParse({
        username: 'valid_user',
        email: 'not-an-email',
        password: 'securePassword123!',
      });
      expect(invalid.success).toBe(false);
    });

    it('rejects short passwords', () => {
      const invalid = registerSchema.safeParse({
        username: 'valid_user',
        email: 'test@example.com',
        password: 'short',
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe('Login Schema', () => {
    it('accepts valid login with username or email', () => {
      const valid1 = loginSchema.safeParse({
        identifier: 'cyber_warrior',
        password: 'somePassword',
      });
      expect(valid1.success).toBe(true);

      const valid2 = loginSchema.safeParse({
        identifier: 'warrior@example.com',
        password: 'somePassword',
      });
      expect(valid2.success).toBe(true);
    });

    it('rejects empty credentials', () => {
      const invalid = loginSchema.safeParse({
        identifier: '',
        password: '',
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe('Team Schemas', () => {
    it('accepts valid team names', () => {
      const valid = createTeamSchema.safeParse({ name: '0xByteBusters' });
      expect(valid.success).toBe(true);
    });

    it('rejects illegal characters in team name', () => {
      const invalid = createTeamSchema.safeParse({ name: '<script>alert(1)</script>' });
      expect(invalid.success).toBe(false);
    });

    it('normalizes invite codes upon joining', () => {
      const parsed = joinTeamSchema.safeParse({ inviteCode: ' techx-7k9m-x2p4 ' });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.inviteCode).toBe('TECHX-7K9M-X2P4');
      }
    });
  });
});
