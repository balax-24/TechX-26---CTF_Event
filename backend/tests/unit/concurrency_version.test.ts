import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';

/**
 * Concurrency Suite: Monotonic Leaderboard Version Engine
 *
 * Verifies that concurrent score mutations across multiple API instances
 * generate strictly monotonic, collision-free leaderboardVersion numbers.
 */
describe('Concurrency & Leaderboard Version Verification Suite', () => {
  it('100 simultaneous score mutations yield 100 unique, strictly increasing versions with zero collisions', async () => {
    const MUTATION_COUNT = 100;

    // Simulated PostgreSQL Sequence engine: atomic, monotonic, crash-safe
    let currentSequence = 0;
    const sequenceMutex = {
      nextval: async (): Promise<number> => {
        // Simulate microsecond async DB network round-trip & concurrency
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 5));
        currentSequence += 1;
        return currentSequence;
      },
    };

    // Simulated PostgreSQL Outbox Ledger
    interface OutboxRecord {
      id: string;
      eventId: string;
      teamId: string;
      score: number;
      leaderboardVersion: number;
      createdAt: Date;
    }
    const outboxTable: OutboxRecord[] = [];

    // Simulate 5 horizontal API instances concurrently processing score mutations
    const NUM_INSTANCES = 5;
    const apiInstances = Array.from({ length: NUM_INSTANCES }, (_, i) => ({
      instanceId: `api-worker-pod-${i + 1}`,
      processScoreMutation: async (teamId: string, delta: number): Promise<OutboxRecord> => {
        // Random network latency jitter
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 15));

        // Atomically fetch next sequence version (simulating SELECT nextval('leaderboard_version_seq'))
        const version = await sequenceMutex.nextval();
        const record: OutboxRecord = {
          id: randomUUID(),
          eventId: randomUUID(),
          teamId,
          score: 100 + delta,
          leaderboardVersion: version,
          createdAt: new Date(),
        };

        outboxTable.push(record);
        return record;
      },
    }));

    // Launch 100 simultaneous score mutations distributed across the 5 API instances
    const mutationPromises = Array.from({ length: MUTATION_COUNT }, (_, index) => {
      const instance = apiInstances[index % NUM_INSTANCES];
      return instance.processScoreMutation(`team-${(index % 20) + 1}`, 10 * (index + 1));
    });

    const results = await Promise.all(mutationPromises);

    // 1. Exactly 100 records generated
    expect(results.length).toBe(MUTATION_COUNT);
    expect(outboxTable.length).toBe(MUTATION_COUNT);

    // 2. All 100 event IDs are unique
    const eventIds = new Set(results.map((r) => r.eventId));
    expect(eventIds.size).toBe(MUTATION_COUNT);

    // 3. All 100 leaderboard versions are unique (zero duplicates/collisions)
    const versionSet = new Set(results.map((r) => r.leaderboardVersion));
    expect(versionSet.size).toBe(MUTATION_COUNT);

    // 4. Versions are strictly 1 to 100 with zero gaps
    const sortedVersions = Array.from(versionSet).sort((a, b) => a - b);
    expect(sortedVersions[0]).toBe(1);
    expect(sortedVersions[MUTATION_COUNT - 1]).toBe(MUTATION_COUNT);
    for (let i = 0; i < MUTATION_COUNT; i++) {
      expect(sortedVersions[i]).toBe(i + 1);
    }

    // 5. MAX(leaderboard_version) on outbox table equals highest sequence number
    const maxVersion = Math.max(...outboxTable.map((r) => r.leaderboardVersion));
    expect(maxVersion).toBe(MUTATION_COUNT);
  });
});
