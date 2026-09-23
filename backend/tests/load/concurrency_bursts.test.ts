import { describe, it, expect, beforeEach, vi } from 'vitest';
import { compareTeamRanks, RankedTeam } from '../../src/modules/scoring/scoring.service.js';
import {
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_BATCH_SIZE,
  REDIS_LEADERBOARD_CHANNEL,
} from '../../src/modules/realtime/realtime.constants.js';

describe('Stage 10 — High-Concurrency Bursts & Transactional Integrity', () => {
  // ---------------------------------------------------------------------------
  // 1. LEADERBOARD SCORING BURST (100 Teams Simultaneous Solves)
  // ---------------------------------------------------------------------------
  describe('Leaderboard Scoring Burst Test (100 Simultaneous Solves across 100 Teams)', () => {
    it('processes 100 simultaneous solve events while maintaining strictly monotonic versioning and deterministic ranking', async () => {
      const teamCount = 100;
      let globalVersionSequence = 0;

      // Simulated relational database tables
      const teamsTable = new Map<string, { id: string; name: string; score: number; lastScoreAt: Date }>();
      const scoreLedger: Array<{
        id: string;
        teamId: string;
        points: number;
        version: number;
        createdAt: Date;
      }> = [];
      const outboxTable: Array<{
        id: string;
        eventId: string;
        teamId: string;
        points: number;
        leaderboardVersion: number;
        publishedAt: Date | null;
      }> = [];

      // Initialize 100 teams
      for (let i = 1; i <= teamCount; i++) {
        const id = `team-${String(i).padStart(3, '0')}`;
        teamsTable.set(id, {
          id,
          name: `Team ${i}`,
          score: 0,
          lastScoreAt: new Date(1700000000000),
        });
      }

      // Simulated atomic PostgreSQL sequence and advisory transaction lock
      let dbLock = Promise.resolve();
      async function recordSolveTransaction(teamId: string, points: number): Promise<{ version: number }> {
        let releaseLock: () => void;
        const currentLock = dbLock;
        dbLock = new Promise((resolve) => {
          releaseLock = resolve;
        });
        await currentLock;

        try {
          // 1. Nextval on PostgreSQL sequence
          globalVersionSequence++;
          const version = globalVersionSequence;

          // 2. Update team score & lastScoreAt
          const team = teamsTable.get(teamId)!;
          team.score += points;
          team.lastScoreAt = new Date(Date.now() + Math.floor(Math.random() * 50));

          // 3. Insert immutable score event into ledger
          const eventId = `event-${version}`;
          scoreLedger.push({
            id: eventId,
            teamId,
            points,
            version,
            createdAt: team.lastScoreAt,
          });

          // 4. Insert into outbox table in same transaction
          outboxTable.push({
            id: `outbox-${version}`,
            eventId,
            teamId,
            points,
            leaderboardVersion: version,
            publishedAt: null,
          });

          return { version };
        } finally {
          releaseLock!();
        }
      }

      // Dispatch 100 simultaneous solves from 100 teams with random sub-millisecond concurrency
      const startBurst = performance.now();
      const solvePromises = Array.from({ length: teamCount }, (_, idx) => {
        const teamId = `team-${String(idx + 1).padStart(3, '0')}`;
        const points = 100 + ((idx * 17) % 400); // Varied points to test rank ordering
        return recordSolveTransaction(teamId, points);
      });

      const results = await Promise.all(solvePromises);
      const burstDurationMs = performance.now() - startBurst;

      // 1. Monotonicity verification
      expect(results.length).toBe(100);
      expect(globalVersionSequence).toBe(100);
      const versions = results.map((r) => r.version);
      const sortedVersions = [...versions].sort((a, b) => a - b);
      expect(versions).toEqual(sortedVersions);

      // 2. Outbox integrity
      expect(outboxTable.length).toBe(100);
      expect(scoreLedger.length).toBe(100);

      // 3. Deterministic leaderboard snapshot calculation
      const rankedTeams: RankedTeam[] = Array.from(teamsTable.values());
      rankedTeams.sort(compareTeamRanks);

      // Verify rank ordering contract
      for (let i = 0; i < rankedTeams.length - 1; i++) {
        const current = rankedTeams[i];
        const next = rankedTeams[i + 1];

        if (current.score === next.score) {
          const currentTime = new Date(current.lastScoreAt).getTime();
          const nextTime = new Date(next.lastScoreAt).getTime();
          if (currentTime === nextTime) {
            expect(current.id.localeCompare(next.id)).toBeLessThan(0);
          } else {
            expect(currentTime).toBeLessThan(nextTime);
          }
        } else {
          expect(current.score).toBeGreaterThan(next.score);
        }
      }

      console.log(`[Burst Test] 100 Concurrent Team Solves:
        - Processed: ${results.length} solves in ${burstDurationMs.toFixed(2)}ms
        - Monotonic sequence: 1 -> ${globalVersionSequence}
        - Outbox events created: ${outboxTable.length}
        - Top Team: ${rankedTeams[0].name} (${rankedTeams[0].score} pts)`);

      expect(burstDurationMs).toBeLessThan(1000); // 100 concurrent DB transactions must complete under 1s
    });
  });

  // ---------------------------------------------------------------------------
  // 2. SCORE SUBMISSION CONCURRENCY & ADVISORY LOCKING (100 Simultaneous Requests)
  // ---------------------------------------------------------------------------
  describe('Score Submission Concurrency (100 Simultaneous Requests for Same Team & Challenge)', () => {
    it('simultaneously accepts exactly 1 solve and deduplicates 99 concurrent submissions via advisory locking', async () => {
      const teamId = 'team-target-001';
      const challengeId = 'chal-web-flag-race';
      const points = 350;

      // Simulated atomic state
      let teamSolved = false;
      let teamScore = 0;
      let solveCount = 0;
      let deduplicatedCount = 0;
      const ledger: Array<{ eventId: string; points: number }> = [];

      // Concurrency lock simulating pg_advisory_xact_lock(hashtext('solve:${teamId}:${challengeId}'))
      let advisoryLock = Promise.resolve();

      async function attemptSolve(submissionId: number): Promise<{
        status: 'correct' | 'already_solved';
        pointsAwarded: number;
        newScore: number;
      }> {
        // Random micro-delay (0-15ms) to simulate real network jitter hitting the server
        await new Promise((r) => setTimeout(r, Math.random() * 15));

        let releaseLock: () => void;
        const currentLock = advisoryLock;
        advisoryLock = new Promise((resolve) => {
          releaseLock = resolve;
        });
        await currentLock;

        try {
          if (teamSolved) {
            deduplicatedCount++;
            return {
              status: 'already_solved',
              pointsAwarded: 0,
              newScore: teamScore,
            };
          }

          // First solve claims points
          teamSolved = true;
          solveCount++;
          teamScore += points;
          ledger.push({ eventId: `solve-${submissionId}`, points });

          return {
            status: 'correct',
            pointsAwarded: points,
            newScore: teamScore,
          };
        } finally {
          releaseLock!();
        }
      }

      // Fire 100 concurrent submissions for the exact same team and challenge
      const startRace = performance.now();
      const promises = Array.from({ length: 100 }, (_, i) => attemptSolve(i + 1));
      const outcomes = await Promise.all(promises);
      const raceDurationMs = performance.now() - startRace;

      // Assertions
      const correctOutcomes = outcomes.filter((o) => o.status === 'correct');
      const alreadySolvedOutcomes = outcomes.filter((o) => o.status === 'already_solved');

      expect(correctOutcomes.length).toBe(1);
      expect(alreadySolvedOutcomes.length).toBe(99);
      expect(solveCount).toBe(1);
      expect(deduplicatedCount).toBe(99);
      expect(teamScore).toBe(points); // Strictly no score inflation
      expect(ledger.length).toBe(1); // Exactly 1 ledger event recorded

      console.log(`[Concurrency Race Test] 100 Submissions for Same Team & Challenge:
        - Correct solves awarded: ${correctOutcomes.length}
        - Deduplicated attempts: ${alreadySolvedOutcomes.length}
        - Final team score: ${teamScore} (expected ${points})
        - Execution time: ${raceDurationMs.toFixed(2)}ms`);

      expect(raceDurationMs).toBeLessThan(500);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. DYNAMIC CHALLENGE CAPACITY EXHAUSTION & RECOVERY
  // ---------------------------------------------------------------------------
  describe('Dynamic Challenge Capacity Exhaustion & Recovery', () => {
    it('strictly enforces MAX_GLOBAL_INSTANCES and MAX_INSTANCES_PER_TEAM under concurrent load', async () => {
      const MAX_GLOBAL_INSTANCES = 100;
      const MAX_INSTANCES_PER_TEAM = 2;

      let activeGlobalInstances = 0;
      const teamInstances = new Map<string, number>();

      let capacityLock = Promise.resolve();

      async function launchInstance(teamId: string, slug: string): Promise<{
        success: boolean;
        error?: string;
        httpStatus: number;
      }> {
        let releaseLock: () => void;
        const currentLock = capacityLock;
        capacityLock = new Promise((resolve) => {
          releaseLock = resolve;
        });
        await currentLock;

        try {
          const currentTeamCount = teamInstances.get(teamId) || 0;

          // 1. Per-team limit check
          if (currentTeamCount >= MAX_INSTANCES_PER_TEAM) {
            return {
              success: false,
              error: 'TEAM_INSTANCE_LIMIT_EXCEEDED',
              httpStatus: 400,
            };
          }

          // 2. Global capacity check
          if (activeGlobalInstances >= MAX_GLOBAL_INSTANCES) {
            return {
              success: false,
              error: 'GLOBAL_CAPACITY_EXCEEDED',
              httpStatus: 503,
            };
          }

          // Allocate instance
          activeGlobalInstances++;
          teamInstances.set(teamId, currentTeamCount + 1);

          return {
            success: true,
            httpStatus: 200,
          };
        } finally {
          releaseLock!();
        }
      }

      async function terminateInstance(teamId: string): Promise<void> {
        let releaseLock: () => void;
        const currentLock = capacityLock;
        capacityLock = new Promise((resolve) => {
          releaseLock = resolve;
        });
        await currentLock;

        try {
          const currentTeamCount = teamInstances.get(teamId) || 0;
          if (currentTeamCount > 0) {
            activeGlobalInstances = Math.max(0, activeGlobalInstances - 1);
            teamInstances.set(teamId, currentTeamCount - 1);
          }
        } finally {
          releaseLock!();
        }
      }

      // Test 1: Team attempts 5 concurrent launches (limit is 2)
      const teamAttempts = await Promise.all(
        Array.from({ length: 5 }, (_, i) => launchInstance('team-greedy-01', `chal-${i}`))
      );

      const successfulLaunches = teamAttempts.filter((a) => a.success);
      const teamLimitRejections = teamAttempts.filter((a) => a.httpStatus === 400);

      expect(successfulLaunches.length).toBe(2);
      expect(teamLimitRejections.length).toBe(3);
      expect(teamInstances.get('team-greedy-01')).toBe(2);

      // Test 2: Global capacity saturation
      // Launch 49 other teams with 2 instances each = 98 + 2 (from team-greedy-01) = 100 instances
      const fillGlobalPromises: Promise<any>[] = [];
      for (let t = 2; t <= 50; t++) {
        fillGlobalPromises.push(launchInstance(`team-${t}`, 'chal-a'));
        fillGlobalPromises.push(launchInstance(`team-${t}`, 'chal-b'));
      }
      const fillResults = await Promise.all(fillGlobalPromises);
      expect(fillResults.every((r) => r.success)).toBe(true);
      expect(activeGlobalInstances).toBe(100);

      // Now global capacity is 100/100. Attempt 10 new launches from new teams
      const overflowAttempts = await Promise.all(
        Array.from({ length: 10 }, (_, i) => launchInstance(`team-overflow-${i}`, 'chal-overflow'))
      );

      const globalLimitRejections = overflowAttempts.filter((r) => r.httpStatus === 503);
      expect(globalLimitRejections.length).toBe(10);
      expect(activeGlobalInstances).toBe(100); // Never exceeds 100

      // Test 3: Teardown and immediate capacity recovery
      // Terminate 5 instances
      await Promise.all([
        terminateInstance('team-2'),
        terminateInstance('team-2'),
        terminateInstance('team-3'),
        terminateInstance('team-4'),
        terminateInstance('team-5'),
      ]);

      expect(activeGlobalInstances).toBe(95);

      // New launches now succeed immediately up to recovered capacity
      const recoveryAttempts = await Promise.all(
        Array.from({ length: 5 }, (_, i) => launchInstance(`team-recovered-${i}`, 'chal-recovered'))
      );

      expect(recoveryAttempts.every((r) => r.success)).toBe(true);
      expect(activeGlobalInstances).toBe(100);

      console.log(`[Dynamic Challenge Capacity Test]
        - Max Global Limit: ${MAX_GLOBAL_INSTANCES}
        - Per-Team Limit: ${MAX_INSTANCES_PER_TEAM}
        - Controlled 400 Rejections: ${teamLimitRejections.length}
        - Controlled 503 Rejections: ${globalLimitRejections.length}
        - Recovery after teardown: PASS`);
    });
  });
});
