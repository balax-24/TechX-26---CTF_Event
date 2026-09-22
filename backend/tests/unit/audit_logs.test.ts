import { describe, it, expect } from 'vitest';
import { sanitizeAuditData } from '../../src/modules/admin/audit.service.js';
import { auditLogQuerySchema } from '../../src/modules/admin/admin.schema.js';

describe('Audit Logging System & Secret Redaction', () => {
  // ---------------------------------------------------------------------------
  // 1. RECURSIVE SECRET REDACTION
  // ---------------------------------------------------------------------------
  describe('sanitizeAuditData Secret Stripping', () => {
    it('redacts password and passwordHash fields', () => {
      const input = {
        userId: 'u1',
        username: 'alice',
        password: 'PlaintextPassword123!',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$fakehash',
      };
      const result = sanitizeAuditData(input);
      expect(result.password).toBe('[REDACTED]');
      expect(result.passwordHash).toBe('[REDACTED]');
      expect(result.username).toBe('alice');
    });

    it('redacts flag, rawFlag, and flagHash fields', () => {
      const input = {
        challengeId: 'c1',
        title: 'Buffer Overflow',
        flag: 'TECHX{secret_flag_value}',
        flagHash: 'sha256_hash_here',
        hmacSecret: 'super_secret_key',
      };
      const result = sanitizeAuditData(input);
      expect(result.flag).toBe('[REDACTED]');
      expect(result.flagHash).toBe('[REDACTED]');
      expect(result.hmacSecret).toBe('[REDACTED]');
      expect(result.title).toBe('Buffer Overflow');
    });

    it('redacts nested secrets inside deep JSON structures and arrays', () => {
      const input = {
        metadata: {
          session: {
            token: 'jwt.token.value',
            refreshToken: 'refresh.token.value',
          },
          checkpoints: [
            { step: 1, secretProof: 'secret_step_1' },
            { step: 2, secretProof: 'secret_step_2' },
          ],
        },
      };
      const result = sanitizeAuditData(input);
      expect(result.metadata.session.token).toBe('[REDACTED]');
      expect(result.metadata.session.refreshToken).toBe('[REDACTED]');
      expect(result.metadata.checkpoints[0].secretProof).toBe('[REDACTED]');
      expect(result.metadata.checkpoints[1].secretProof).toBe('[REDACTED]');
      expect(result.metadata.checkpoints[0].step).toBe(1);
    });

    it('leaves non-sensitive fields completely intact', () => {
      const input = {
        teamId: 't1',
        teamName: 'BinaryExplorers',
        score: 1250,
        delta: 100,
        reason: 'Bonus awarded for good sportsmanship',
      };
      const result = sanitizeAuditData(input);
      expect(result).toEqual(input);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. AUDIT QUERY SCHEMA VALIDATION
  // ---------------------------------------------------------------------------
  describe('Audit Query Schema Validation', () => {
    it('sets default pagination if omitted (page=1, limit=20)', () => {
      const parsed = auditLogQuerySchema.safeParse({});
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.page).toBe(1);
        expect(parsed.data.limit).toBe(20);
      }
    });

    it('caps limit at 100 max', () => {
      const parsed = auditLogQuerySchema.safeParse({ limit: 500 });
      expect(parsed.success).toBe(false);
    });

    it('accepts filter parameters', () => {
      const parsed = auditLogQuerySchema.safeParse({
        action: 'ADMIN_SCORE_ADJUSTMENT',
        entityType: 'team',
        actorId: 'a0000000-0000-0000-0000-000000000001',
        page: 2,
        limit: 50,
      });
      expect(parsed.success).toBe(true);
    });
  });
});
