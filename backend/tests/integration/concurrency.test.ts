import { describe, it, expect } from 'vitest';

/**
 * Concurrency & Atomic Integrity Simulation Suite
 *
 * Simulates PostgreSQL SERIALIZABLE / READ COMMITTED transactions with row-level locks
 * and unique database constraints:
 * - UNIQUE(team_id, challenge_id) on team_solves
 * - UNIQUE(team_id, checkpoint_id) on checkpoint_progress
 * - UNIQUE(team_id, hint_id) on team_hints
 */
describe('High-Concurrency Competitive Integrity Tests', () => {
  // ---------------------------------------------------------------------------
  // TEST A: 50 Concurrent Correct Submissions by the Same Team
  // ---------------------------------------------------------------------------
  it('Test A: 50 simultaneous correct submissions by same team yield exactly 1 reward and 49 duplicate results', async () => {
    const teamId = 'team-alpha-001';
    const challengeId = 'chal-pwn-500';
    const challengePoints = 500;

    // Database state simulation
    const teamSolvesTable = new Set<string>(); // composite key: `${teamId}:${challengeId}`
    const scoreEventsTable: Array<{ teamId: string; points: number; type: string }> = [];
    let teamMaterializedScore = 0;

    // Lock simulation simulating PostgreSQL transaction + UNIQUE constraint
    let dbMutex = Promise.resolve();

    async function submitFlagConcurrently(workerId: number): Promise<{
      status: 'correct' | 'already_solved';
      pointsAwarded: number;
    }> {
      // Simulate random network jitter (0-20ms) so all 50 hit the DB concurrently
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 20));

      // Acquire DB transaction
      let unlock: () => void;
      const prevMutex = dbMutex;
      dbMutex = new Promise((resolve) => {
        unlock = resolve;
      });
      await prevMutex;

      try {
        const solveKey = `${teamId}:${challengeId}`;

        // 1. Check if already solved (SELECT ... FOR UPDATE or UNIQUE insert check)
        if (teamSolvesTable.has(solveKey)) {
          return {
            status: 'already_solved',
            pointsAwarded: 0,
          };
        }

        // 2. Insert into team_solves (guaranteed unique by DB)
        teamSolvesTable.add(solveKey);

        // 3. Insert score event
        scoreEventsTable.push({
          teamId,
          points: challengePoints,
          type: 'final_solve',
        });

        // 4. Update team score
        teamMaterializedScore += challengePoints;

        return {
          status: 'correct',
          pointsAwarded: challengePoints,
        };
      } finally {
        unlock!();
      }
    }

    // Launch 50 simultaneous submissions
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) => submitFlagConcurrently(i))
    );

    const successfulSolves = results.filter((r) => r.status === 'correct');
    const duplicateSolves = results.filter((r) => r.status === 'already_solved');

    expect(successfulSolves.length).toBe(1);
    expect(duplicateSolves.length).toBe(49);
    expect(successfulSolves[0].pointsAwarded).toBe(500);

    // Database invariants verification
    expect(teamSolvesTable.size).toBe(1);
    expect(scoreEventsTable.length).toBe(1);
    expect(teamMaterializedScore).toBe(500);
  });

  // ---------------------------------------------------------------------------
  // TEST B: 50 Concurrent Checkpoint Submissions by the Same Team
  // ---------------------------------------------------------------------------
  it('Test B: 50 simultaneous checkpoint submissions by same team yield exactly 1 reward and 49 duplicate results', async () => {
    const teamId = 'team-alpha-001';
    const checkpointId = 'checkpoint-step-1';
    const checkpointPoints = 50;

    const checkpointProgressTable = new Set<string>(); // composite: `${teamId}:${checkpointId}`
    const scoreEventsTable: Array<{ teamId: string; points: number; type: string }> = [];
    let teamMaterializedScore = 0;

    let dbMutex = Promise.resolve();

    async function submitCheckpointConcurrently(workerId: number): Promise<{
      status: 'correct' | 'already_completed';
      pointsAwarded: number;
    }> {
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 20));

      let unlock: () => void;
      const prevMutex = dbMutex;
      dbMutex = new Promise((resolve) => {
        unlock = resolve;
      });
      await prevMutex;

      try {
        const cpKey = `${teamId}:${checkpointId}`;
        if (checkpointProgressTable.has(cpKey)) {
          return {
            status: 'already_completed',
            pointsAwarded: 0,
          };
        }

        checkpointProgressTable.add(cpKey);
        scoreEventsTable.push({
          teamId,
          points: checkpointPoints,
          type: 'checkpoint_solve',
        });
        teamMaterializedScore += checkpointPoints;

        return {
          status: 'correct',
          pointsAwarded: checkpointPoints,
        };
      } finally {
        unlock!();
      }
    }

    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) => submitCheckpointConcurrently(i))
    );

    const successfulAwards = results.filter((r) => r.status === 'correct');
    const duplicateAwards = results.filter((r) => r.status === 'already_completed');

    expect(successfulAwards.length).toBe(1);
    expect(duplicateAwards.length).toBe(49);
    expect(successfulAwards[0].pointsAwarded).toBe(50);

    expect(checkpointProgressTable.size).toBe(1);
    expect(scoreEventsTable.length).toBe(1);
    expect(teamMaterializedScore).toBe(50);
  });

  // ---------------------------------------------------------------------------
  // TEST C: 50 Submissions from Different Teams
  // ---------------------------------------------------------------------------
  it('Test C: 50 simultaneous submissions from 50 distinct teams yield 50 independent rewards', async () => {
    const challengeId = 'chal-web-300';
    const challengePoints = 300;

    const teamSolvesTable = new Set<string>();
    const teamScores = new Map<string, number>();

    let dbMutex = Promise.resolve();

    async function submitTeamFlag(teamIndex: number): Promise<{
      teamId: string;
      status: 'correct' | 'already_solved';
      pointsAwarded: number;
    }> {
      const teamId = `team-${teamIndex}`;
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 20));

      let unlock: () => void;
      const prevMutex = dbMutex;
      dbMutex = new Promise((resolve) => {
        unlock = resolve;
      });
      await prevMutex;

      try {
        const solveKey = `${teamId}:${challengeId}`;
        if (teamSolvesTable.has(solveKey)) {
          return { teamId, status: 'already_solved', pointsAwarded: 0 };
        }

        teamSolvesTable.add(solveKey);
        teamScores.set(teamId, (teamScores.get(teamId) || 0) + challengePoints);

        return { teamId, status: 'correct', pointsAwarded: challengePoints };
      } finally {
        unlock!();
      }
    }

    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) => submitTeamFlag(i))
    );

    const successfulSolves = results.filter((r) => r.status === 'correct');
    expect(successfulSolves.length).toBe(50);
    expect(teamSolvesTable.size).toBe(50);

    for (let i = 0; i < 50; i++) {
      expect(teamScores.get(`team-${i}`)).toBe(300);
    }
  });

  // ---------------------------------------------------------------------------
  // TEST D: Concurrent Checkpoint + Final Solve Point Capping
  // ---------------------------------------------------------------------------
  it('Test D: Concurrent checkpoint and final solve cannot exceed configured challenge maximum', async () => {
    const teamId = 'team-gamma-777';
    const challengePoints = 400;
    const checkpointPoints = 100;

    let checkpointCompleted = false;
    let finalSolveCompleted = false;
    let totalPointsAwarded = 0;

    let dbMutex = Promise.resolve();

    async function doCheckpoint(): Promise<number> {
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 15));
      let unlock: () => void;
      const prev = dbMutex;
      dbMutex = new Promise((res) => { unlock = res; });
      await prev;
      try {
        if (finalSolveCompleted || checkpointCompleted) return 0;
        checkpointCompleted = true;
        totalPointsAwarded += checkpointPoints;
        return checkpointPoints;
      } finally {
        unlock!();
      }
    }

    async function doFinalSolve(): Promise<number> {
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 15));
      let unlock: () => void;
      const prev = dbMutex;
      dbMutex = new Promise((res) => { unlock = res; });
      await prev;
      try {
        if (finalSolveCompleted) return 0;
        finalSolveCompleted = true;
        // Remaining points = Math.max(0, challenge.points - awardedCheckpoints)
        const awardedCheckpoints = checkpointCompleted ? checkpointPoints : 0;
        const remainingPoints = Math.max(0, challengePoints - awardedCheckpoints);
        totalPointsAwarded += remainingPoints;
        return remainingPoints;
      } finally {
        unlock!();
      }
    }

    // Run both actions concurrently
    await Promise.all([doCheckpoint(), doFinalSolve()]);

    // Regardless of execution order: Total points MUST equal 400
    expect(totalPointsAwarded).toBe(challengePoints);
  });

  // ---------------------------------------------------------------------------
  // TEST E: Concurrent Hint Unlock
  // ---------------------------------------------------------------------------
  it('Test E: 50 concurrent hint unlock requests apply exactly 1 penalty', async () => {
    const teamId = 'team-delta-999';
    const hintId = 'hint-uuid-001';
    const penaltyPoints = 25;

    const teamHintsTable = new Set<string>(); // composite: `${teamId}:${hintId}`
    let totalPenaltiesDeducted = 0;

    let dbMutex = Promise.resolve();

    async function unlockHintConcurrently(workerId: number): Promise<{
      alreadyUnlocked: boolean;
      penaltyDeducted: number;
    }> {
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 20));

      let unlock: () => void;
      const prevMutex = dbMutex;
      dbMutex = new Promise((resolve) => {
        unlock = resolve;
      });
      await prevMutex;

      try {
        const hintKey = `${teamId}:${hintId}`;
        if (teamHintsTable.has(hintKey)) {
          return { alreadyUnlocked: true, penaltyDeducted: 0 };
        }

        teamHintsTable.add(hintKey);
        totalPenaltiesDeducted += penaltyPoints;

        return { alreadyUnlocked: false, penaltyDeducted: penaltyPoints };
      } finally {
        unlock!();
      }
    }

    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) => unlockHintConcurrently(i))
    );

    const firstUnlock = results.filter((r) => !r.alreadyUnlocked);
    const duplicateUnlocks = results.filter((r) => r.alreadyUnlocked);

    expect(firstUnlock.length).toBe(1);
    expect(duplicateUnlocks.length).toBe(49);
    expect(firstUnlock[0].penaltyDeducted).toBe(25);
    expect(totalPenaltiesDeducted).toBe(25);
    expect(teamHintsTable.size).toBe(1);
  });
});
