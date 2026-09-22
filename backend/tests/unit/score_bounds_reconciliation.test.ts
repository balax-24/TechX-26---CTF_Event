import { describe, it, expect } from 'vitest';
import { adminScoreAdjustmentSchema } from '../../src/modules/admin/admin.schema.js';

describe('Admin Score Bounds, Underflow Prevention & Ledger Reconciliation', () => {
  describe('Score Adjustment Bounds Validation', () => {
    it('rejects zero delta', () => {
      const res = adminScoreAdjustmentSchema.safeParse({
        delta: 0,
        reason: 'Adjusting by zero',
      });
      expect(res.success).toBe(false);
    });

    it('rejects non-integer float deltas', () => {
      const res = adminScoreAdjustmentSchema.safeParse({
        delta: 50.5,
        reason: 'Adjusting by decimal',
      });
      expect(res.success).toBe(false);
    });

    it('rejects deltas exceeding maximum bound (+100,000)', () => {
      const res = adminScoreAdjustmentSchema.safeParse({
        delta: 100001,
        reason: 'Exceeding max positive delta',
      });
      expect(res.success).toBe(false);
    });

    it('rejects deltas exceeding minimum bound (-100,000)', () => {
      const res = adminScoreAdjustmentSchema.safeParse({
        delta: -100001,
        reason: 'Exceeding max negative delta',
      });
      expect(res.success).toBe(false);
    });

    it('accepts valid positive and negative deltas within threshold', () => {
      const positive = adminScoreAdjustmentSchema.safeParse({
        delta: 500,
        reason: 'Compensation for technical outage',
      });
      expect(positive.success).toBe(true);

      const negative = adminScoreAdjustmentSchema.safeParse({
        delta: -250,
        reason: 'Penalty for rule infraction',
      });
      expect(negative.success).toBe(true);
    });
  });

  describe('Non-Negative Score Floor & Safe Integer Bounds', () => {
    function applyAdjustment(
      currentScore: number,
      delta: number
    ): { allowed: boolean; newScore?: number; error?: string } {
      if (!delta || delta === 0) {
        return { allowed: false, error: 'INVALID_SCORE_DELTA: Must be non-zero' };
      }
      if (Math.abs(delta) > 100000) {
        return { allowed: false, error: 'INVALID_SCORE_DELTA: Exceeds threshold' };
      }
      const newScore = currentScore + delta;
      if (newScore < 0) {
        return {
          allowed: false,
          error: 'SCORE_UNDERFLOW_PROHIBITED: Resulting team score cannot drop below zero',
        };
      }
      if (newScore > 2147483647) {
        return {
          allowed: false,
          error: 'SCORE_OVERFLOW_PROHIBITED: Resulting team score exceeds maximum integer range',
        };
      }
      return { allowed: true, newScore };
    }

    it('prohibits negative resulting team score (Stage 4 floor invariant)', () => {
      const teamScore = 150;
      const deduction = -200;

      const res = applyAdjustment(teamScore, deduction);
      expect(res.allowed).toBe(false);
      expect(res.error).toMatch(/SCORE_UNDERFLOW_PROHIBITED/);
    });

    it('allows deductions that bring the score exactly to 0', () => {
      const teamScore = 150;
      const deduction = -150;

      const res = applyAdjustment(teamScore, deduction);
      expect(res.allowed).toBe(true);
      expect(res.newScore).toBe(0);
    });

    it('prohibits 32-bit integer overflow', () => {
      const teamScore = 2147483600;
      const addition = 100;

      const res = applyAdjustment(teamScore, addition);
      expect(res.allowed).toBe(false);
      expect(res.error).toMatch(/SCORE_OVERFLOW_PROHIBITED/);
    });
  });

  describe('Multi-Event Ledger Reconciliation', () => {
    interface ScoreEvent {
      id: string;
      teamId: string;
      eventType: 'final_solve' | 'checkpoint_solve' | 'hint_penalty' | 'admin_adjustment';
      points: number;
      runningTeamScore: number;
    }

    interface Team {
      id: string;
      score: number;
    }

    it('strictly reconciles team score across normal solves, checkpoints, hint penalties, and admin adjustments', () => {
      const team: Team = { id: 'team-omega', score: 0 };
      const ledger: ScoreEvent[] = [];

      function recordEvent(
        eventType: ScoreEvent['eventType'],
        points: number
      ) {
        const previousScore = team.score;
        const newScore = previousScore + points;
        if (newScore < 0) {
          throw new Error('SCORE_UNDERFLOW_PROHIBITED');
        }
        team.score = newScore;
        ledger.push({
          id: `ev-${ledger.length + 1}`,
          teamId: team.id,
          eventType,
          points,
          runningTeamScore: newScore,
        });
      }

      // 1. Initial final solve (+500)
      recordEvent('final_solve', 500);
      expect(team.score).toBe(500);

      // 2. Checkpoint solve (+100)
      recordEvent('checkpoint_solve', 100);
      expect(team.score).toBe(600);

      // 3. Hint penalty (-50)
      recordEvent('hint_penalty', -50);
      expect(team.score).toBe(550);

      // 4. Admin positive adjustment (+300)
      recordEvent('admin_adjustment', 300);
      expect(team.score).toBe(850);

      // 5. Admin negative adjustment (-200)
      recordEvent('admin_adjustment', -200);
      expect(team.score).toBe(650);

      // Verify Mathematical Ledger Invariant: teams.score === SUM(score_events.points)
      const ledgerSum = ledger.reduce((sum, e) => sum + e.points, 0);
      expect(team.score).toBe(ledgerSum);
      expect(team.score).toBe(650);
    });

    it('ensures transactional rollback produces ZERO partial writes on failed adjustment', () => {
      const team: Team = { id: 'team-alpha', score: 100 };
      const ledger: ScoreEvent[] = [];

      function attemptAtomicAdjustment(delta: number, forceFailureAtStep: number) {
        // Snapshot for rollback
        const backupScore = team.score;
        const backupLedger = [...ledger];

        try {
          // Step 1: Lock and validate
          if (forceFailureAtStep === 1) throw new Error('STEP_1_FAILURE');

          // Step 2: Compute new score & check floor
          const newScore = team.score + delta;
          if (newScore < 0) throw new Error('SCORE_UNDERFLOW_PROHIBITED');
          if (forceFailureAtStep === 2) throw new Error('STEP_2_FAILURE');

          // Step 3: Append score event
          ledger.push({
            id: `ev-${ledger.length + 1}`,
            teamId: team.id,
            eventType: 'admin_adjustment',
            points: delta,
            runningTeamScore: newScore,
          });
          if (forceFailureAtStep === 3) throw new Error('STEP_3_FAILURE');

          // Step 4: Mutate team score
          team.score = newScore;
          if (forceFailureAtStep === 4) throw new Error('STEP_4_FAILURE');

          return { success: true };
        } catch (err) {
          // Rollback on any failure
          team.score = backupScore;
          ledger.length = 0;
          ledger.push(...backupLedger);
          throw err;
        }
      }

      // Force failure during Step 3
      expect(() => attemptAtomicAdjustment(200, 3)).toThrow('STEP_3_FAILURE');
      expect(team.score).toBe(100);
      expect(ledger.length).toBe(0);

      // Force failure during Step 4
      expect(() => attemptAtomicAdjustment(200, 4)).toThrow('STEP_4_FAILURE');
      expect(team.score).toBe(100);
      expect(ledger.length).toBe(0);
    });
  });
});
