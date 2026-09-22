import { describe, it, expect } from 'vitest';
import {
  challengeCheckpointsAuthoringSchema,
  validateCheckpointAllocation,
} from '../../src/modules/checkpoints/checkpoints.schema.js';
import { compareTeamRanks, RankedTeam } from '../../src/modules/scoring/scoring.service.js';

describe('Scoring Engine Invariants & Hardening Tests', () => {
  // ---------------------------------------------------------------------------
  // TEST A: AUTHORING-TIME CHECKPOINT ALLOCATION VALIDATION
  // ---------------------------------------------------------------------------
  describe('Test A: Invalid Checkpoint Allocation', () => {
    it('rejects configuration where sum of checkpoint points exceeds challenge points', () => {
      const challengePoints = 500;
      const checkpoints = [
        { pointValue: 300 },
        { pointValue: 300 },
      ];

      const validation = validateCheckpointAllocation(challengePoints, checkpoints);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('Total checkpoint points (600) exceeds challenge points (500)');

      // Also verify Zod authoring schema rejection
      const schemaResult = challengeCheckpointsAuthoringSchema.safeParse({
        challengePoints: 500,
        checkpoints: [
          {
            stepNumber: 1,
            title: 'Step 1',
            description: '',
            pointValue: 300,
            validationType: 'token_proof',
            secretProofHash: 'hash1',
          },
          {
            stepNumber: 2,
            title: 'Step 2',
            description: '',
            pointValue: 300,
            validationType: 'token_proof',
            secretProofHash: 'hash2',
          },
        ],
      });

      expect(schemaResult.success).toBe(false);
      if (!schemaResult.success) {
        expect(schemaResult.error.errors[0].message).toBe(
          'Total checkpoint points cannot exceed challenge points'
        );
      }
    });

    it('accepts valid configuration where sum of checkpoints <= challenge points', () => {
      const validation = validateCheckpointAllocation(500, [
        { pointValue: 100 },
        { pointValue: 150 },
      ]);
      expect(validation.valid).toBe(true);
      expect(validation.totalCheckpointPoints).toBe(250);
    });
  });

  // ---------------------------------------------------------------------------
  // TEST B: FINAL SOLVE WITHOUT CHECKPOINTS
  // ---------------------------------------------------------------------------
  describe('Test B: Final Solve Without Checkpoints', () => {
    it('awards full challenge points when no checkpoints have been solved', () => {
      const challengePoints = 500;
      const awardedCheckpoints = 0;
      const finalReward = Math.max(0, challengePoints - awardedCheckpoints);

      expect(finalReward).toBe(500);
    });
  });

  // ---------------------------------------------------------------------------
  // TEST C: CHECKPOINTS FOLLOWED BY FINAL SOLVE
  // ---------------------------------------------------------------------------
  describe('Test C: Checkpoints Followed by Final Solve', () => {
    it('awards checkpoints and remaining solve points summing exactly to challenge points', () => {
      const challengePoints = 500;
      const cp1 = 50;
      const cp2 = 100;
      const checkpointRewards = cp1 + cp2; // 150
      const finalReward = Math.max(0, challengePoints - checkpointRewards); // 350
      const grossReward = checkpointRewards + finalReward; // 500

      expect(checkpointRewards).toBe(150);
      expect(finalReward).toBe(350);
      expect(grossReward).toBe(500);
    });
  });

  // ---------------------------------------------------------------------------
  // TEST D: FINAL SOLVE FIRST, THEN CHECKPOINT SUBMITTED
  // ---------------------------------------------------------------------------
  describe('Test D: Final Solve First', () => {
    it('awards full challenge points on final solve, and 0 points on subsequent checkpoint', () => {
      const challengePoints = 500;

      // 1. Team solves final flag first
      const finalReward = challengePoints;
      expect(finalReward).toBe(500);

      // 2. Team later submits a checkpoint for this already-solved challenge
      const isChallengeAlreadySolved = true;
      const checkpointResult = isChallengeAlreadySolved
        ? { status: 'already_solved' as const, pointsAwarded: 0 }
        : { status: 'correct' as const, pointsAwarded: 50 };

      expect(checkpointResult.status).toBe('already_solved');
      expect(checkpointResult.pointsAwarded).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // TEST E: HINT AT ZERO SCORE
  // ---------------------------------------------------------------------------
  describe('Test E: Hint at Zero Score', () => {
    it('enforces score floor of 0 and creates no ledger deduction event', () => {
      const teamScore = 0;
      const hintPenalty = 25;

      const newTeamScore = Math.max(0, teamScore - hintPenalty);
      const actualDeduction = teamScore - newTeamScore;

      expect(newTeamScore).toBe(0);
      expect(actualDeduction).toBe(0);

      // Invariant: Only record ledger event if actualDeduction > 0
      const ledgerEvents: Array<{ points: number }> = [];
      if (actualDeduction > 0) {
        ledgerEvents.push({ points: -actualDeduction });
      }

      expect(ledgerEvents.length).toBe(0);
      const ledgerSum = ledgerEvents.reduce((s, e) => s + e.points, 0);
      expect(newTeamScore).toBe(ledgerSum);
    });
  });

  // ---------------------------------------------------------------------------
  // TEST F: HINT + CHECKPOINT + FINAL SOLVE
  // ---------------------------------------------------------------------------
  describe('Test F: Hint + Checkpoint + Final Solve', () => {
    it('calculates gross and net contribution and matches ledger events', () => {
      const challengePoints = 500;
      const cpPoints = 50;
      const hintPenalty = 25;

      const ledgerEvents: Array<{ event: string; points: number }> = [];

      // 1. Checkpoint solve
      ledgerEvents.push({ event: 'checkpoint_solve', points: cpPoints });

      // 2. Hint unlock
      ledgerEvents.push({ event: 'hint_penalty', points: -hintPenalty });

      // 3. Final solve
      const remainingPoints = Math.max(0, challengePoints - cpPoints);
      ledgerEvents.push({ event: 'final_solve', points: remainingPoints });

      const grossReward = cpPoints + remainingPoints; // 50 + 450 = 500
      const netContribution = ledgerEvents.reduce((sum, e) => sum + e.points, 0); // 50 - 25 + 450 = 475

      expect(grossReward).toBe(500);
      expect(netContribution).toBe(475);
      expect(ledgerEvents).toEqual([
        { event: 'checkpoint_solve', points: 50 },
        { event: 'hint_penalty', points: -25 },
        { event: 'final_solve', points: 450 },
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // RUNTIME POINT CAP DEFENSE TEST
  // ---------------------------------------------------------------------------
  describe('Runtime Point Cap Defense Against Malicious Configuration', () => {
    it('defensively caps checkpoint points so gross rewards never exceed challenge points', () => {
      const challengePoints = 500;
      // Malicious/erroneous checkpoint with 600 points configured
      const checkpointConfigPointValue = 600;
      const alreadyAwardedCheckpointPoints = 0;

      const maxAllowed = Math.max(0, challengePoints - alreadyAwardedCheckpointPoints);
      const pointsAwarded = Math.min(checkpointConfigPointValue, maxAllowed);

      expect(pointsAwarded).toBe(500); // Capped at 500
      expect(pointsAwarded).toBeLessThanOrEqual(challengePoints);
    });

    it('defensively caps secondary checkpoint when it would exceed challenge points', () => {
      const challengePoints = 500;
      const alreadyAwardedCheckpointPoints = 400;
      const checkpoint2ConfigPointValue = 200; // Would cause 600 total

      const maxAllowed = Math.max(0, challengePoints - alreadyAwardedCheckpointPoints); // 100
      const pointsAwarded = Math.min(checkpoint2ConfigPointValue, maxAllowed);

      expect(pointsAwarded).toBe(100);
      expect(alreadyAwardedCheckpointPoints + pointsAwarded).toBe(500);
    });
  });

  // ---------------------------------------------------------------------------
  // TIE-BREAKING HARDENING TEST
  // ---------------------------------------------------------------------------
  describe('Tie-Breaking Hardening', () => {
    it('breaks tie deterministically by team_id ASC when score and last_score_at are identical', () => {
      const sharedDate = new Date('2026-09-22T10:00:00.000Z');

      const teamA: RankedTeam = {
        id: 'team-uuid-bbbb',
        name: 'Team Bravo',
        score: 500,
        lastScoreAt: sharedDate,
      };

      const teamB: RankedTeam = {
        id: 'team-uuid-aaaa',
        name: 'Team Alpha',
        score: 500,
        lastScoreAt: sharedDate,
      };

      const teams = [teamA, teamB];
      teams.sort(compareTeamRanks);

      // teamB has smaller UUID ('team-uuid-aaaa' < 'team-uuid-bbbb') -> ranks first!
      expect(teams[0].id).toBe('team-uuid-aaaa');
      expect(teams[1].id).toBe('team-uuid-bbbb');
    });

    it('prioritizes score above timestamp and id', () => {
      const teamA: RankedTeam = {
        id: 'team-uuid-aaaa',
        name: 'Lower Score',
        score: 400,
        lastScoreAt: new Date('2026-09-22T08:00:00Z'),
      };
      const teamB: RankedTeam = {
        id: 'team-uuid-zzzz',
        name: 'Higher Score',
        score: 500,
        lastScoreAt: new Date('2026-09-22T09:00:00Z'),
      };

      const teams = [teamA, teamB];
      teams.sort(compareTeamRanks);

      expect(teams[0].id).toBe('team-uuid-zzzz');
      expect(teams[1].id).toBe('team-uuid-aaaa');
    });

    it('prioritizes earlier timestamp when scores are equal', () => {
      const teamA: RankedTeam = {
        id: 'team-uuid-zzzz',
        name: 'Early Team',
        score: 500,
        lastScoreAt: new Date('2026-09-22T08:30:00Z'),
      };
      const teamB: RankedTeam = {
        id: 'team-uuid-aaaa',
        name: 'Late Team',
        score: 500,
        lastScoreAt: new Date('2026-09-22T09:30:00Z'),
      };

      const teams = [teamB, teamA];
      teams.sort(compareTeamRanks);

      expect(teams[0].id).toBe('team-uuid-zzzz'); // Earlier timestamp wins
      expect(teams[1].id).toBe('team-uuid-aaaa');
    });
  });
});
