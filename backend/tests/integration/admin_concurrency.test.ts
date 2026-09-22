import { describe, it, expect } from 'vitest';
import { ALLOWED_TRANSITIONS, CompetitionLifecycleState } from '../../src/modules/competition/competition.schema.js';

describe('Stage 6 Admin & Control Plane Concurrency Simulations', () => {
  // ---------------------------------------------------------------------------
  // CASE 1: 100 SIMULTANEOUS ADMIN SCORE ADJUSTMENTS
  // ---------------------------------------------------------------------------
  it('Case 1: 100 simultaneous admin score adjustments produce 100 valid ledger events, 100 audit records, no lost updates, and unique leaderboard versions', async () => {
    const teamId = 'team-concurrency-target';
    const initialScore = 1000;
    let teamMaterializedScore = initialScore;

    // Simulated database tables
    const scoreEventsTable: Array<{
      id: number;
      teamId: string;
      eventType: string;
      points: number;
      runningScore: number;
    }> = [];

    const auditLogsTable: Array<{
      id: number;
      action: string;
      entityId: string;
      delta: number;
      actorId: string;
      reason: string;
    }> = [];

    const outboxTable: Array<{
      id: number;
      leaderboardVersion: number;
      pointsDelta: number;
      newScore: number;
    }> = [];

    const idempotencyTable = new Map<string, any>();

    // Sequence generator for leaderboard_version_seq
    let sequenceCounter = 1000;
    const getNextSequence = () => ++sequenceCounter;

    // PostgreSQL Row-Level Lock Mutex (simulates SELECT ... FOR UPDATE on teams)
    let teamRowLock = Promise.resolve();

    async function executeAdminAdjustment(params: {
      workerId: number;
      delta: number;
      reason: string;
      idempotencyKey: string;
    }): Promise<{
      success: boolean;
      newScore: number;
      leaderboardVersion: number;
      isIdempotentReplay: boolean;
    }> {
      // Simulate network jitter
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 15));

      // Acquire exclusive row lock (SELECT ... FOR UPDATE)
      let unlock: () => void;
      const prevLock = teamRowLock;
      teamRowLock = new Promise((resolve) => {
        unlock = resolve;
      });
      await prevLock;

      try {
        // 1. Check idempotency table
        if (idempotencyTable.has(params.idempotencyKey)) {
          return {
            ...idempotencyTable.get(params.idempotencyKey),
            isIdempotentReplay: true,
          };
        }

        // 2. Read locked row
        const currentScore = teamMaterializedScore;
        const newScore = currentScore + params.delta;

        // 3. Update team score
        teamMaterializedScore = newScore;

        // 4. Append to immutable score ledger
        const ledgerId = scoreEventsTable.length + 1;
        scoreEventsTable.push({
          id: ledgerId,
          teamId,
          eventType: 'admin_adjustment',
          points: params.delta,
          runningScore: newScore,
        });

        // 5. Draw next version from monotonic sequence
        const leaderboardVersion = getNextSequence();

        // 6. Record outbox entry
        outboxTable.push({
          id: outboxTable.length + 1,
          leaderboardVersion,
          pointsDelta: params.delta,
          newScore,
        });

        // 7. Record audit log
        auditLogsTable.push({
          id: auditLogsTable.length + 1,
          action: 'ADMIN_SCORE_ADJUSTMENT',
          entityId: teamId,
          delta: params.delta,
          actorId: `admin-${params.workerId % 5}`,
          reason: params.reason,
        });

        const result = {
          success: true,
          newScore,
          leaderboardVersion,
          isIdempotentReplay: false,
        };

        idempotencyTable.set(params.idempotencyKey, result);
        return result;
      } finally {
        unlock!();
      }
    }

    // Launch 100 simultaneous score adjustments with varied deltas (+10, -5, +25, -15, etc.)
    const operations = Array.from({ length: 100 }, (_, i) => {
      const delta = (i % 2 === 0 ? 1 : -1) * ((i % 10) + 5); // deltas between -14 and +14 (non-zero)
      return {
        workerId: i + 1,
        delta,
        reason: `Admin adjustment batch operation #${i + 1}`,
        idempotencyKey: `idemp-key-sim-${i + 1}`,
      };
    });

    const expectedTotalDelta = operations.reduce((sum, op) => sum + op.delta, 0);

    // Run all 100 concurrently
    const results = await Promise.all(operations.map((op) => executeAdminAdjustment(op)));

    // Assertions
    expect(results).toHaveLength(100);
    results.forEach((r) => {
      expect(r.success).toBe(true);
      expect(r.isIdempotentReplay).toBe(false);
    });

    // 1. Verify exact final score matches sum of deltas (No Lost Updates)
    expect(teamMaterializedScore).toBe(initialScore + expectedTotalDelta);

    // 2. Verify score_events ledger integrity (Stage 4 reconciliation invariant)
    expect(scoreEventsTable).toHaveLength(100);
    const sumLedgerDeltas = scoreEventsTable.reduce((sum, evt) => sum + evt.points, 0);
    expect(sumLedgerDeltas).toBe(expectedTotalDelta);
    expect(teamMaterializedScore).toBe(initialScore + sumLedgerDeltas);

    // 3. Verify audit log integrity
    expect(auditLogsTable).toHaveLength(100);
    const sumAuditDeltas = auditLogsTable.reduce((sum, log) => sum + log.delta, 0);
    expect(sumAuditDeltas).toBe(expectedTotalDelta);

    // 4. Verify unique, strictly increasing leaderboard versions
    expect(outboxTable).toHaveLength(100);
    const versions = outboxTable.map((o) => o.leaderboardVersion);
    const uniqueVersions = new Set(versions);
    expect(uniqueVersions.size).toBe(100);
    // Verify versions are strictly monotonic
    for (let i = 1; i < versions.length; i++) {
      expect(versions[i]).toBeGreaterThan(versions[i - 1]);
    }

    // 5. Test idempotency replay: fire all 100 requests again
    const replayResults = await Promise.all(operations.map((op) => executeAdminAdjustment(op)));
    expect(replayResults).toHaveLength(100);
    replayResults.forEach((r) => {
      expect(r.isIdempotentReplay).toBe(true);
    });

    // Verify no new ledger or audit rows were added
    expect(scoreEventsTable).toHaveLength(100);
    expect(auditLogsTable).toHaveLength(100);
    expect(teamMaterializedScore).toBe(initialScore + expectedTotalDelta);
  });

  // ---------------------------------------------------------------------------
  // CASE 2: CONCURRENT PAUSE + RESUME
  // ---------------------------------------------------------------------------
  it('Case 2: 50 concurrent pause and 50 concurrent resume operations maintain valid state machine invariants', async () => {
    let currentState: CompetitionLifecycleState = 'live';
    let isSubmissionEnabled = true;
    let transitionCount = 0;
    let noOpCount = 0;
    let rejectedCount = 0;

    // Mutex simulating PostgreSQL row lock on competition_state table
    let stateLock = Promise.resolve();

    async function applyStateTransition(
      target: 'paused' | 'live',
      actorId: string
    ): Promise<{ success: boolean; state: CompetitionLifecycleState }> {
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 10));

      let unlock: () => void;
      const prevLock = stateLock;
      stateLock = new Promise((resolve) => {
        unlock = resolve;
      });
      await prevLock;

      try {
        if (currentState === target) {
          noOpCount++;
          return { success: true, state: currentState };
        }

        const allowed = ALLOWED_TRANSITIONS[currentState] || [];
        if (!allowed.includes(target)) {
          rejectedCount++;
          throw new Error(`INVALID_STATE_TRANSITION: ${currentState} -> ${target}`);
        }

        currentState = target;
        isSubmissionEnabled = target === 'live';
        transitionCount++;
        return { success: true, state: currentState };
      } finally {
        unlock!();
      }
    }

    // Interleave 50 pause and 50 resume calls simultaneously
    const actions: Array<'paused' | 'live'> = [];
    for (let i = 0; i < 50; i++) {
      actions.push('paused');
      actions.push('live');
    }

    // Shuffle to simulate chaotic concurrent arrival
    actions.sort(() => Math.random() - 0.5);

    const results = await Promise.all(
      actions.map((act, idx) => applyStateTransition(act, `admin-${idx}`))
    );

    expect(results).toHaveLength(100);
    // Final state must be either 'live' or 'paused'
    expect(['live', 'paused']).toContain(currentState);
    expect(isSubmissionEnabled).toBe(currentState === 'live');
    expect(transitionCount + noOpCount).toBe(100);
    expect(rejectedCount).toBe(0); // All transitions were valid between LIVE and PAUSED
  });

  // ---------------------------------------------------------------------------
  // CASE 3: CONCURRENT DISQUALIFY + SCORING SUBMISSION
  // ---------------------------------------------------------------------------
  it('Case 3: Concurrent team disqualification and participant submissions maintain strict transaction ordering', async () => {
    const teamId = 'team-volatile-disqualify';
    let teamStatus: 'active' | 'disqualified' = 'active';
    let teamScore = 0;

    const recordedSolves: string[] = [];
    let disqualifyTimestamp: number | null = null;
    let submissionsRejectedDueToDisqualification = 0;
    let successfulSolves = 0;

    // Mutex simulating PostgreSQL SERIALIZABLE / row-level lock on teams
    let teamLock = Promise.resolve();

    async function submitFlag(chalSlug: string): Promise<{ success: boolean; status: string }> {
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 20));

      let unlock: () => void;
      const prevLock = teamLock;
      teamLock = new Promise((resolve) => {
        unlock = resolve;
      });
      await prevLock;

      try {
        if (teamStatus === 'disqualified') {
          submissionsRejectedDueToDisqualification++;
          return { success: false, status: 'TEAM_DISQUALIFIED' };
        }

        // Simulate solve
        teamScore += 100;
        recordedSolves.push(chalSlug);
        successfulSolves++;
        return { success: true, status: 'correct' };
      } finally {
        unlock!();
      }
    }

    async function disqualifyTeam(): Promise<{ success: boolean }> {
      // Simulate admin clicking disqualify during active solving
      await new Promise((resolve) => setTimeout(resolve, 8));

      let unlock: () => void;
      const prevLock = teamLock;
      teamLock = new Promise((resolve) => {
        unlock = resolve;
      });
      await prevLock;

      try {
        teamStatus = 'disqualified';
        disqualifyTimestamp = Date.now();
        return { success: true };
      } finally {
        unlock!();
      }
    }

    // 25 flag submissions + 1 disqualification event running concurrently
    const submissionPromises = Array.from({ length: 25 }, (_, i) =>
      submitFlag(`chal-slug-${i + 1}`)
    );
    const disqualifyPromise = disqualifyTeam();

    const [subResults, disqResult] = await Promise.all([
      Promise.all(submissionPromises),
      disqualifyPromise,
    ]);

    expect(disqResult.success).toBe(true);
    expect(teamStatus).toBe('disqualified');

    // Every submission was either accepted (before disqualification) or rejected (after disqualification)
    expect(successfulSolves + submissionsRejectedDueToDisqualification).toBe(25);
    // Score reflects exact number of successful solves before disqualification committed
    expect(teamScore).toBe(successfulSolves * 100);
    expect(recordedSolves).toHaveLength(successfulSolves);

    // Any subsequent submission MUST be rejected
    const lateSubmission = await submitFlag('chal-post-disqualify');
    expect(lateSubmission.success).toBe(false);
    expect(lateSubmission.status).toBe('TEAM_DISQUALIFIED');
  });
});
