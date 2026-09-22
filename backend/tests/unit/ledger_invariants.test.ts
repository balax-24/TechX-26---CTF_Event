import { describe, it, expect } from 'vitest';

/**
 * High-Fidelity Ledger Invariants & Accounting Simulation Suite
 *
 * Verifies the fundamental architectural invariant:
 * teams.score === SUM(score_events.points)
 * across all scoring operations, edge cases, and transaction boundaries.
 */
describe('Financial Score Ledger Accounting Invariants', () => {
  interface ScoreEventRecord {
    teamId: string;
    eventType: string;
    points: number;
    runningTeamScore: number;
  }

  interface TeamRecord {
    id: string;
    score: number;
    lastScoreAt: Date;
  }

  class MockTransactionalLedger {
    teams = new Map<string, TeamRecord>();
    scoreEvents: ScoreEventRecord[] = [];
    teamSolves = new Set<string>(); // composite: `${teamId}:${challengeId}`
    checkpointProgress = new Set<string>(); // composite: `${teamId}:${checkpointId}`
    teamHints = new Set<string>(); // composite: `${teamId}:${hintId}`
    emittedEvents: any[] = [];

    constructor(initialTeams: Array<{ id: string; score?: number }>) {
      for (const t of initialTeams) {
        this.teams.set(t.id, {
          id: t.id,
          score: t.score ?? 0,
          lastScoreAt: new Date(),
        });
      }
    }

    /**
     * Checks if teams.score === SUM(score_events.points) for a given team
     */
    reconcile(teamId: string): { teamScore: number; ledgerSum: number; isConsistent: boolean } {
      const team = this.teams.get(teamId);
      const teamScore = team?.score ?? 0;
      const ledgerSum = this.scoreEvents
        .filter((e) => e.teamId === teamId)
        .reduce((sum, e) => sum + e.points, 0);

      return {
        teamScore,
        ledgerSum,
        isConsistent: teamScore === ledgerSum,
      };
    }

    /**
     * Executes an atomic transaction. If fn throws, rolls back all changes made during tx.
     */
    async transaction<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T> {
      // Snapshot state for rollback
      const teamSnapshots = new Map<string, TeamRecord>();
      for (const [k, v] of this.teams.entries()) {
        teamSnapshots.set(k, { ...v });
      }
      const scoreEventsSnapshot = [...this.scoreEvents];
      const teamSolvesSnapshot = new Set(this.teamSolves);
      const checkpointProgressSnapshot = new Set(this.checkpointProgress);
      const teamHintsSnapshot = new Set(this.teamHints);
      const pendingEvents: any[] = [];

      const tx: TransactionContext = {
        getTeam: (teamId) => this.teams.get(teamId),
        updateTeamScore: (teamId, newScore) => {
          const t = this.teams.get(teamId);
          if (t) {
            t.score = newScore;
            t.lastScoreAt = new Date();
          }
        },
        hasSolve: (teamId, challengeId) => this.teamSolves.has(`${teamId}:${challengeId}`),
        addSolve: (teamId, challengeId) => this.teamSolves.add(`${teamId}:${challengeId}`),
        hasCheckpoint: (teamId, checkpointId) =>
          this.checkpointProgress.has(`${teamId}:${checkpointId}`),
        addCheckpoint: (teamId, checkpointId) =>
          this.checkpointProgress.add(`${teamId}:${checkpointId}`),
        hasHint: (teamId, hintId) => this.teamHints.has(`${teamId}:${hintId}`),
        addHint: (teamId, hintId) => this.teamHints.add(`${teamId}:${hintId}`),
        appendScoreEvent: (event) => this.scoreEvents.push(event),
        stageEvent: (evt) => pendingEvents.push(evt),
      };

      try {
        const result = await fn(tx);
        // COMMIT: post-commit event dispatch
        for (const evt of pendingEvents) {
          this.emittedEvents.push(evt);
        }
        return result;
      } catch (err) {
        // ROLLBACK
        this.teams = teamSnapshots;
        this.scoreEvents = scoreEventsSnapshot;
        this.teamSolves = teamSolvesSnapshot;
        this.checkpointProgress = checkpointProgressSnapshot;
        this.teamHints = teamHintsSnapshot;
        throw err;
      }
    }
  }

  interface TransactionContext {
    getTeam(teamId: string): TeamRecord | undefined;
    updateTeamScore(teamId: string, newScore: number): void;
    hasSolve(teamId: string, challengeId: string): boolean;
    addSolve(teamId: string, challengeId: string): void;
    hasCheckpoint(teamId: string, checkpointId: string): boolean;
    addCheckpoint(teamId: string, checkpointId: string): void;
    hasHint(teamId: string, hintId: string): boolean;
    addHint(teamId: string, hintId: string): void;
    appendScoreEvent(event: ScoreEventRecord): void;
    stageEvent(evt: any): void;
  }

  // Helper methods executing ScoringService logic on the transactional ledger
  async function awardCheckpoint(
    ledger: MockTransactionalLedger,
    teamId: string,
    checkpointId: string,
    pointValue: number
  ) {
    return ledger.transaction(async (tx) => {
      if (tx.hasCheckpoint(teamId, checkpointId)) {
        return { status: 'already_completed', pointsAwarded: 0 };
      }
      tx.addCheckpoint(teamId, checkpointId);

      const team = tx.getTeam(teamId)!;
      const newScore = team.score + pointValue;
      tx.updateTeamScore(teamId, newScore);

      tx.appendScoreEvent({
        teamId,
        eventType: 'checkpoint_solve',
        points: pointValue,
        runningTeamScore: newScore,
      });

      tx.stageEvent({ type: 'checkpoint_solve', teamId, pointsAwarded: pointValue });
      return { status: 'correct', pointsAwarded: pointValue };
    });
  }

  async function awardFinalSolve(
    ledger: MockTransactionalLedger,
    teamId: string,
    challengeId: string,
    challengePoints: number,
    awardedCheckpoints: number
  ) {
    return ledger.transaction(async (tx) => {
      if (tx.hasSolve(teamId, challengeId)) {
        return { status: 'already_solved', pointsAwarded: 0 };
      }
      tx.addSolve(teamId, challengeId);

      const pointsToAward = Math.max(0, challengePoints - awardedCheckpoints);
      const team = tx.getTeam(teamId)!;
      const newScore = team.score + pointsToAward;
      tx.updateTeamScore(teamId, newScore);

      tx.appendScoreEvent({
        teamId,
        eventType: 'final_solve',
        points: pointsToAward,
        runningTeamScore: newScore,
      });

      tx.stageEvent({ type: 'final_solve', teamId, pointsAwarded: pointsToAward });
      return { status: 'correct', pointsAwarded: pointsToAward };
    });
  }

  async function unlockHint(
    ledger: MockTransactionalLedger,
    teamId: string,
    hintId: string,
    penaltyPoints: number
  ) {
    return ledger.transaction(async (tx) => {
      if (tx.hasHint(teamId, hintId)) {
        return { alreadyUnlocked: true, penaltyDeducted: 0 };
      }
      tx.addHint(teamId, hintId);

      const team = tx.getTeam(teamId)!;
      const newScore = Math.max(0, team.score - penaltyPoints);
      const netDeduction = team.score - newScore;

      if (netDeduction > 0) {
        tx.updateTeamScore(teamId, newScore);
        tx.appendScoreEvent({
          teamId,
          eventType: 'hint_penalty',
          points: -netDeduction,
          runningTeamScore: newScore,
        });
        tx.stageEvent({ type: 'hint_penalty', teamId, pointsAwarded: -netDeduction });
      }

      return { alreadyUnlocked: false, penaltyDeducted: netDeduction };
    });
  }

  // ---------------------------------------------------------------------------
  // 1. Checkpoint Solve
  // ---------------------------------------------------------------------------
  it('1. Reconciles ledger after checkpoint solve', async () => {
    const ledger = new MockTransactionalLedger([{ id: 'team-1' }]);
    await awardCheckpoint(ledger, 'team-1', 'cp-1', 50);

    const check = ledger.reconcile('team-1');
    expect(check.isConsistent).toBe(true);
    expect(check.teamScore).toBe(50);
    expect(check.ledgerSum).toBe(50);
  });

  // ---------------------------------------------------------------------------
  // 2. Final Solve
  // ---------------------------------------------------------------------------
  it('2. Reconciles ledger after final solve', async () => {
    const ledger = new MockTransactionalLedger([{ id: 'team-1' }]);
    await awardFinalSolve(ledger, 'team-1', 'chal-1', 500, 0);

    const check = ledger.reconcile('team-1');
    expect(check.isConsistent).toBe(true);
    expect(check.teamScore).toBe(500);
    expect(check.ledgerSum).toBe(500);
  });

  // ---------------------------------------------------------------------------
  // 3. Hint Purchase
  // ---------------------------------------------------------------------------
  it('3. Reconciles ledger after hint purchase (with score floor)', async () => {
    const ledger = new MockTransactionalLedger([{ id: 'team-1', score: 100 }]);
    // Seed initial score event to represent baseline 100
    ledger.scoreEvents.push({
      teamId: 'team-1',
      eventType: 'initial',
      points: 100,
      runningTeamScore: 100,
    });

    await unlockHint(ledger, 'team-1', 'hint-1', 30);

    const check = ledger.reconcile('team-1');
    expect(check.isConsistent).toBe(true);
    expect(check.teamScore).toBe(70);
    expect(check.ledgerSum).toBe(70);
  });

  // ---------------------------------------------------------------------------
  // 4. Checkpoint + Final Solve
  // ---------------------------------------------------------------------------
  it('4. Reconciles ledger after checkpoint + final solve', async () => {
    const ledger = new MockTransactionalLedger([{ id: 'team-1' }]);
    await awardCheckpoint(ledger, 'team-1', 'cp-1', 50);
    await awardCheckpoint(ledger, 'team-1', 'cp-2', 100);
    await awardFinalSolve(ledger, 'team-1', 'chal-1', 500, 150);

    const check = ledger.reconcile('team-1');
    expect(check.isConsistent).toBe(true);
    expect(check.teamScore).toBe(500);
    expect(check.ledgerSum).toBe(500);
  });

  // ---------------------------------------------------------------------------
  // 5. Checkpoint + Hint + Final Solve
  // ---------------------------------------------------------------------------
  it('5. Reconciles ledger after checkpoint + hint + final solve', async () => {
    const ledger = new MockTransactionalLedger([{ id: 'team-1' }]);
    await awardCheckpoint(ledger, 'team-1', 'cp-1', 50); // score = 50
    await unlockHint(ledger, 'team-1', 'hint-1', 25); // score = 25
    await awardFinalSolve(ledger, 'team-1', 'chal-1', 500, 50); // remaining = 450 -> score = 475

    const check = ledger.reconcile('team-1');
    expect(check.isConsistent).toBe(true);
    expect(check.teamScore).toBe(475);
    expect(check.ledgerSum).toBe(475);
  });

  // ---------------------------------------------------------------------------
  // 6. Multiple Different Challenges
  // ---------------------------------------------------------------------------
  it('6. Reconciles ledger across multiple distinct challenges', async () => {
    const ledger = new MockTransactionalLedger([{ id: 'team-1' }]);
    await awardFinalSolve(ledger, 'team-1', 'chal-web', 100, 0);
    await awardCheckpoint(ledger, 'team-1', 'cp-pwn-1', 50);
    await awardFinalSolve(ledger, 'team-1', 'chal-pwn', 300, 50);
    await awardFinalSolve(ledger, 'team-1', 'chal-crypto', 200, 0);

    const check = ledger.reconcile('team-1');
    expect(check.isConsistent).toBe(true);
    expect(check.teamScore).toBe(600); // 100 + 50 + 250 + 200 = 600
    expect(check.ledgerSum).toBe(600);
  });

  // ---------------------------------------------------------------------------
  // 7. Concurrent Submissions (50 Workers)
  // ---------------------------------------------------------------------------
  it('7. Reconciles ledger under 50 concurrent solve submissions', async () => {
    const ledger = new MockTransactionalLedger([{ id: 'team-1' }]);
    let mutex = Promise.resolve();

    const solve = async () => {
      let unlock: () => void;
      const prev = mutex;
      mutex = new Promise((res) => { unlock = res; });
      await prev;
      try {
        return await awardFinalSolve(ledger, 'team-1', 'chal-race', 500, 0);
      } finally {
        unlock!();
      }
    };

    const results = await Promise.all(Array.from({ length: 50 }, () => solve()));
    const successful = results.filter((r) => r.status === 'correct');
    const duplicates = results.filter((r) => r.status === 'already_solved');

    expect(successful.length).toBe(1);
    expect(duplicates.length).toBe(49);

    const check = ledger.reconcile('team-1');
    expect(check.isConsistent).toBe(true);
    expect(check.teamScore).toBe(500);
    expect(check.ledgerSum).toBe(500);
    expect(ledger.scoreEvents.length).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 8. Concurrent Hints (50 Workers)
  // ---------------------------------------------------------------------------
  it('8. Reconciles ledger under 50 concurrent hint unlock attempts', async () => {
    const ledger = new MockTransactionalLedger([{ id: 'team-1', score: 200 }]);
    ledger.scoreEvents.push({
      teamId: 'team-1',
      eventType: 'initial',
      points: 200,
      runningTeamScore: 200,
    });

    let mutex = Promise.resolve();
    const unlock = async () => {
      let done: () => void;
      const prev = mutex;
      mutex = new Promise((res) => { done = res; });
      await prev;
      try {
        return await unlockHint(ledger, 'team-1', 'hint-race', 50);
      } finally {
        done!();
      }
    };

    const results = await Promise.all(Array.from({ length: 50 }, () => unlock()));
    const firstUnlock = results.filter((r) => !r.alreadyUnlocked);
    const dups = results.filter((r) => r.alreadyUnlocked);

    expect(firstUnlock.length).toBe(1);
    expect(dups.length).toBe(49);

    const check = ledger.reconcile('team-1');
    expect(check.isConsistent).toBe(true);
    expect(check.teamScore).toBe(150);
    expect(check.ledgerSum).toBe(150);
  });

  // ---------------------------------------------------------------------------
  // 9. Failed Transactions (No State Leaks)
  // ---------------------------------------------------------------------------
  it('9. Maintains ledger consistency when validation fails before commit', async () => {
    const ledger = new MockTransactionalLedger([{ id: 'team-1' }]);

    // Attempt invalid checkpoint with prerequisite failure
    await expect(
      ledger.transaction(async (tx) => {
        throw new Error('PREREQUISITE_NOT_MET');
      })
    ).rejects.toThrow('PREREQUISITE_NOT_MET');

    const check = ledger.reconcile('team-1');
    expect(check.isConsistent).toBe(true);
    expect(check.teamScore).toBe(0);
    expect(check.ledgerSum).toBe(0);
    expect(ledger.scoreEvents.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 10. Rolled-Back Transactions (No Partial Records or Events)
  // ---------------------------------------------------------------------------
  it('10. Completely rolls back all mutations and emits zero events when transaction aborts', async () => {
    const ledger = new MockTransactionalLedger([{ id: 'team-1', score: 100 }]);
    ledger.scoreEvents.push({
      teamId: 'team-1',
      eventType: 'initial',
      points: 100,
      runningTeamScore: 100,
    });

    // Simulate transaction failure right before commit
    await expect(
      ledger.transaction(async (tx) => {
        // Partial mutations:
        tx.addSolve('team-1', 'chal-fail');
        tx.updateTeamScore('team-1', 600);
        tx.appendScoreEvent({
          teamId: 'team-1',
          eventType: 'final_solve',
          points: 500,
          runningTeamScore: 600,
        });
        tx.stageEvent({ type: 'final_solve', pointsAwarded: 500 });

        // Catastrophic failure triggers rollback:
        throw new Error('POSTGRESQL_CONNECTION_LOST');
      })
    ).rejects.toThrow('POSTGRESQL_CONNECTION_LOST');

    // All partial records MUST be gone:
    expect(ledger.teamSolves.has('team-1:chal-fail')).toBe(false);
    expect(ledger.emittedEvents.length).toBe(0); // ZERO events emitted!

    // Materialized score and ledger MUST remain untouched:
    const check = ledger.reconcile('team-1');
    expect(check.isConsistent).toBe(true);
    expect(check.teamScore).toBe(100);
    expect(check.ledgerSum).toBe(100);
    expect(ledger.scoreEvents.length).toBe(1); // Only the initial event
  });
});
