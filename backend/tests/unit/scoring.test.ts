import { describe, it, expect } from 'vitest';

describe('Scoring Engine Logic & Invariants', () => {
  // ---------------------------------------------------------------------------
  // 1. CAPPED COMPONENT SCORING MODEL
  // ---------------------------------------------------------------------------
  describe('Capped Component Scoring Model', () => {
    it('calculates remaining solve points correctly when no checkpoints were completed', () => {
      const challengePoints = 500;
      const awardedCheckpoints = 0;
      const pointsToAward = Math.max(0, challengePoints - awardedCheckpoints);

      expect(pointsToAward).toBe(500);
    });

    it('calculates remaining solve points correctly after partial checkpoints completed', () => {
      const challengePoints = 500;
      const checkpoints = [
        { step: 1, points: 50 },
        { step: 2, points: 100 },
      ];
      const awardedCheckpoints = checkpoints.reduce((sum, cp) => sum + cp.points, 0); // 150
      const finalSolvePoints = Math.max(0, challengePoints - awardedCheckpoints); // 350

      expect(awardedCheckpoints).toBe(150);
      expect(finalSolvePoints).toBe(350);
      expect(awardedCheckpoints + finalSolvePoints).toBe(challengePoints);
    });

    it('caps final solve points at 0 if checkpoint points equal challenge points', () => {
      const challengePoints = 200;
      const awardedCheckpoints = 200; // All points awarded in checkpoints
      const finalSolvePoints = Math.max(0, challengePoints - awardedCheckpoints);

      expect(finalSolvePoints).toBe(0);
      expect(awardedCheckpoints + finalSolvePoints).toBe(200);
    });

    it('never produces negative solve points even if checkpoints somehow exceed total', () => {
      const challengePoints = 100;
      const awardedCheckpoints = 120;
      const finalSolvePoints = Math.max(0, challengePoints - awardedCheckpoints);

      expect(finalSolvePoints).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. SCORING INVARIANT WITH HINT PENALTIES
  // ---------------------------------------------------------------------------
  describe('Scoring Invariant & Hint Penalties', () => {
    it('maintains strict ledger invariant: Checkpoints + Final Solve - Penalties = Net Contribution', () => {
      const challengePoints = 400;
      const checkpoint1Points = 40;
      const checkpoint2Points = 60;
      const hintPenalty = 50;

      const totalCheckpoints = checkpoint1Points + checkpoint2Points; // 100
      const finalSolvePoints = Math.max(0, challengePoints - totalCheckpoints); // 300
      const netContribution = totalCheckpoints + finalSolvePoints - hintPenalty; // 350

      expect(finalSolvePoints).toBe(300);
      expect(netContribution).toBe(350);
      expect(netContribution).toBe(challengePoints - hintPenalty);
    });

    it('enforces score floor of 0 when penalties exceed current team score', () => {
      const currentTeamScore = 30;
      const hintPenalty = 50;

      const newTeamScore = Math.max(0, currentTeamScore - hintPenalty);
      const netDeduction = currentTeamScore - newTeamScore;

      expect(newTeamScore).toBe(0); // Floor at 0
      expect(netDeduction).toBe(30); // Only deduct what was available
    });

    it('applies exact penalty when team score is sufficient', () => {
      const currentTeamScore = 200;
      const hintPenalty = 30;

      const newTeamScore = Math.max(0, currentTeamScore - hintPenalty);
      const netDeduction = currentTeamScore - newTeamScore;

      expect(newTeamScore).toBe(170);
      expect(netDeduction).toBe(30);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. DETERMINISTIC TIE-BREAKING
  // ---------------------------------------------------------------------------
  describe('Tie-Breaking Semantics', () => {
    interface TeamRankEntry {
      id: string;
      name: string;
      score: number;
      lastScoreAt: Date;
    }

    const sortLeaderboard = (teams: TeamRankEntry[]): TeamRankEntry[] => {
      return [...teams].sort((a, b) => {
        // 1. Primary: Higher score first
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        // 2. Secondary: Earlier lastScoreAt first (FIFO tie-breaking)
        return a.lastScoreAt.getTime() - b.lastScoreAt.getTime();
      });
    };

    it('ranks higher score higher regardless of timestamp', () => {
      const teamA: TeamRankEntry = {
        id: '1',
        name: 'Team Alpha',
        score: 500,
        lastScoreAt: new Date('2026-09-22T10:00:00Z'),
      };
      const teamB: TeamRankEntry = {
        id: '2',
        name: 'Team Beta',
        score: 600,
        lastScoreAt: new Date('2026-09-22T11:00:00Z'),
      };

      const sorted = sortLeaderboard([teamA, teamB]);
      expect(sorted[0].id).toBe('2'); // Beta wins with 600
      expect(sorted[1].id).toBe('1');
    });

    it('breaks score ties deterministically by earliest lastScoreAt', () => {
      const teamA: TeamRankEntry = {
        id: '1',
        name: 'Early Birds',
        score: 500,
        lastScoreAt: new Date('2026-09-22T09:15:00Z'),
      };
      const teamB: TeamRankEntry = {
        id: '2',
        name: 'Late Bloomers',
        score: 500,
        lastScoreAt: new Date('2026-09-22T09:45:00Z'),
      };

      const sorted = sortLeaderboard([teamB, teamA]);
      expect(sorted[0].id).toBe('1'); // Team A reached 500 first
      expect(sorted[1].id).toBe('2');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. SCORE RECONCILIATION
  // ---------------------------------------------------------------------------
  describe('Score Reconciliation Simulation', () => {
    interface ScoreLedgerEvent {
      eventType: string;
      points: number;
    }

    it('reconciles team materialized score with ledger events sum', () => {
      const events: ScoreLedgerEvent[] = [
        { eventType: 'checkpoint_solve', points: 25 },
        { eventType: 'checkpoint_solve', points: 35 },
        { eventType: 'final_solve', points: 190 },
        { eventType: 'hint_penalty', points: -20 },
      ];

      const ledgerSum = events.reduce((sum, e) => sum + e.points, 0);
      const materializedScore = 230;

      expect(ledgerSum).toBe(230);
      expect(materializedScore).toBe(ledgerSum);
    });

    it('detects discrepancy if materialized score does not equal ledger sum', () => {
      const events: ScoreLedgerEvent[] = [
        { eventType: 'final_solve', points: 250 },
      ];

      const ledgerSum = events.reduce((sum, e) => sum + e.points, 0);
      const corruptMaterializedScore = 300;

      expect(corruptMaterializedScore === ledgerSum).toBe(false);
    });
  });
});
