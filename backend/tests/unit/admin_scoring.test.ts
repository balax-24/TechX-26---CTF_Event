import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminScoreAdjustmentSchema } from '../../src/modules/admin/admin.schema.js';
import { ScoringService } from '../../src/modules/scoring/scoring.service.js';

describe('Administrative Score Adjustments & Ledger Integrity', () => {
  let scoringService: ScoringService;

  beforeEach(() => {
    scoringService = new ScoringService();
  });

  // ---------------------------------------------------------------------------
  // 1. INPUT VALIDATION & CONSTRAINTS
  // ---------------------------------------------------------------------------
  describe('Admin Score Adjustment Input Validation', () => {
    it('rejects delta of 0', () => {
      const result = adminScoreAdjustmentSchema.safeParse({
        delta: 0,
        reason: 'Zero point change',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toMatch(/non-zero integer/i);
      }
    });

    it('rejects reason shorter than 5 characters', () => {
      const result = adminScoreAdjustmentSchema.safeParse({
        delta: 100,
        reason: 'Oops',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toMatch(/at least 5 characters/i);
      }
    });

    it('accepts positive delta with valid reason', () => {
      const result = adminScoreAdjustmentSchema.safeParse({
        delta: 250,
        reason: 'First-blood bonus compensation for infrastructure outage',
        idempotencyKey: 'idemp-bonus-12345',
      });
      expect(result.success).toBe(true);
    });

    it('accepts negative delta with valid reason (penalty)', () => {
      const result = adminScoreAdjustmentSchema.safeParse({
        delta: -150,
        reason: 'Penalty: Denial-of-service attack on scoreboard gateway',
      });
      expect(result.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. DOMAIN LOGIC & LEDGER INVARIANT PRESERVATION
  // ---------------------------------------------------------------------------
  describe('applyAdminAdjustment Invariant Checks', () => {
    it('throws INVALID_SCORE_DELTA if delta is 0', async () => {
      await expect(
        scoringService.applyAdminAdjustment({
          teamId: 't0000000-0000-0000-0000-000000000001',
          delta: 0,
          reason: 'Valid length reason here',
          actorUserId: 'a0000000-0000-0000-0000-000000000001',
          actorRole: 'admin',
          actorIp: '127.0.0.1',
        })
      ).rejects.toThrow('INVALID_SCORE_DELTA');
    });

    it('throws REASON_REQUIRED if reason is empty or whitespace', async () => {
      await expect(
        scoringService.applyAdminAdjustment({
          teamId: 't0000000-0000-0000-0000-000000000001',
          delta: 100,
          reason: '   ',
          actorUserId: 'a0000000-0000-0000-0000-000000000001',
          actorRole: 'admin',
          actorIp: '127.0.0.1',
        })
      ).rejects.toThrow('REASON_REQUIRED');
    });

    it('returns isIdempotentReplay: true on replayed idempotencyKey without modifying score', async () => {
      // Mock existing key retrieval
      const mockCachedResult = {
        success: true,
        isIdempotentReplay: false,
        teamId: 't0000000-0000-0000-0000-000000000001',
        teamName: 'CyberPunks',
        previousScore: 400,
        newScore: 500,
        delta: 100,
        eventId: 'evt-001',
        leaderboardVersion: 42,
        reason: 'Bonus awarded earlier',
        adjustedAt: new Date().toISOString(),
      };

      vi.spyOn(scoringService, 'applyAdminAdjustment').mockImplementation(async (params) => {
        if (params.idempotencyKey === 'existing-key-999') {
          return {
            ...mockCachedResult,
            isIdempotentReplay: true,
          };
        }
        return mockCachedResult;
      });

      const firstCall = await scoringService.applyAdminAdjustment({
        teamId: 't0000000-0000-0000-0000-000000000001',
        delta: 100,
        reason: 'Bonus points for contest challenge bug report',
        actorUserId: 'a0000000-0000-0000-0000-000000000001',
        actorRole: 'admin',
        actorIp: '127.0.0.1',
        idempotencyKey: 'new-key-111',
      });
      expect(firstCall.isIdempotentReplay).toBe(false);

      const replayCall = await scoringService.applyAdminAdjustment({
        teamId: 't0000000-0000-0000-0000-000000000001',
        delta: 100,
        reason: 'Bonus points for contest challenge bug report',
        actorUserId: 'a0000000-0000-0000-0000-000000000001',
        actorRole: 'admin',
        actorIp: '127.0.0.1',
        idempotencyKey: 'existing-key-999',
      });
      expect(replayCall.isIdempotentReplay).toBe(true);
      expect(replayCall.newScore).toBe(500);
    });
  });
});
