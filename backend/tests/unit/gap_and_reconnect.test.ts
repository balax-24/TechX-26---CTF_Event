import { describe, it, expect, vi } from 'vitest';
import { LeaderboardClient, LeaderboardEventPayload } from '../../src/modules/leaderboard/leaderboard.client.js';
import { LeaderboardSnapshot } from '../../src/modules/leaderboard/leaderboard.service.js';

describe('Real-Time Recovery, Gap Detection & Duplicate Event Tolerance Suite', () => {
  // ---------------------------------------------------------------------------
  // 1. DUPLICATE EVENT HANDLING (WORKER CRASH SIMULATION)
  // ---------------------------------------------------------------------------
  describe('Duplicate Event Handling', () => {
    it('worker crash simulation: duplicate delivery is tolerated idempotently with no double score mutation', async () => {
      // Setup server authoritative state
      let serverLeaderboard: LeaderboardSnapshot = {
        leaderboardVersion: 1,
        updatedAt: new Date().toISOString(),
        totalTeams: 2,
        entries: [
          { rank: 1, teamId: 'team-alpha', teamName: 'Alpha', score: 100, lastScoreAt: '2026-09-22T10:00:00.000Z' },
          { rank: 2, teamId: 'team-bravo', teamName: 'Bravo', score: 50, lastScoreAt: '2026-09-22T09:30:00.000Z' },
        ],
      };

      const fetchSnapshot = vi.fn(async () => serverLeaderboard);
      const client = new LeaderboardClient({ fetchSnapshot });

      // Client initializes with version 1
      client.applySnapshot(serverLeaderboard);
      expect(client.getVersion()).toBe(1);
      expect(client.getTeamScore('team-alpha')).toBe(100);

      // Score mutation occurs: team Alpha solves a challenge (+50 points, new score: 150)
      const event: LeaderboardEventPayload = {
        eventId: 'event-uuid-solve-999',
        eventType: 'final_solve',
        teamId: 'team-alpha',
        teamName: 'Alpha',
        score: 150, // Absolute score
        pointsDelta: 50,
        leaderboardVersion: 2,
        challengeTitle: 'Buffer Overflow 101',
        timestamp: '2026-09-22T10:05:00.000Z',
      };

      // 1. Worker publishes event to Redis -> Client receives it
      const firstResult = await client.applyEvent(event);
      expect(firstResult).toBe('applied');
      expect(client.getVersion()).toBe(2);
      expect(client.getTeamScore('team-alpha')).toBe(150);

      // 2. SIMULATION: Worker crashed before writing published_at to PostgreSQL!
      // Worker restarts, re-claims the unpublished outbox row, and publishes to Redis again.
      const secondResult = await client.applyEvent(event);

      // 3. Client tolerates duplicate delivery idempotently
      expect(secondResult).toBe('duplicate_ignored');
      expect(client.getVersion()).toBe(2);
      // Score MUST still be 150 (NOT 200)
      expect(client.getTeamScore('team-alpha')).toBe(150);
      expect(fetchSnapshot).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 2. SNAPSHOT CONVERGENCE AFTER CLIENT DISCONNECT
  // ---------------------------------------------------------------------------
  describe('Snapshot Convergence', () => {
    it('client disconnects, misses multiple events, reconnects and converges via authoritative snapshot', async () => {
      // Initial state: version 10
      const initialSnapshot: LeaderboardSnapshot = {
        leaderboardVersion: 10,
        updatedAt: new Date().toISOString(),
        totalTeams: 3,
        entries: [
          { rank: 1, teamId: 'team-1', teamName: 'Team 1', score: 500, lastScoreAt: '2026-09-22T10:00:00.000Z' },
          { rank: 2, teamId: 'team-2', teamName: 'Team 2', score: 300, lastScoreAt: '2026-09-22T09:00:00.000Z' },
          { rank: 3, teamId: 'team-3', teamName: 'Team 3', score: 200, lastScoreAt: '2026-09-22T08:00:00.000Z' },
        ],
      };

      // Server evolves while client is disconnected: versions 11, 12, 13 occur
      const updatedServerSnapshot: LeaderboardSnapshot = {
        leaderboardVersion: 13,
        updatedAt: new Date().toISOString(),
        totalTeams: 3,
        entries: [
          { rank: 1, teamId: 'team-2', teamName: 'Team 2', score: 700, lastScoreAt: '2026-09-22T11:00:00.000Z' },
          { rank: 2, teamId: 'team-1', teamName: 'Team 1', score: 500, lastScoreAt: '2026-09-22T10:00:00.000Z' },
          { rank: 3, teamId: 'team-3', teamName: 'Team 3', score: 450, lastScoreAt: '2026-09-22T10:30:00.000Z' },
        ],
      };

      let currentServerSnapshot = initialSnapshot;
      const fetchSnapshot = vi.fn(async () => currentServerSnapshot);
      const client = new LeaderboardClient({ fetchSnapshot });

      // Client connected at version 10
      client.applySnapshot(initialSnapshot);
      expect(client.getVersion()).toBe(10);
      expect(client.getTeamRank('team-1')).toBe(1);

      // Client DISCONNECTS. Server updates to version 13.
      currentServerSnapshot = updatedServerSnapshot;

      // Client RECONNECTS: fetches authoritative snapshot from GET /api/v1/leaderboard
      await client.recoverViaSnapshot();

      // Client state converges to authoritative PostgreSQL snapshot
      expect(client.getVersion()).toBe(13);
      expect(client.getTeamScore('team-2')).toBe(700);
      expect(client.getTeamRank('team-2')).toBe(1);
      expect(client.getTeamRank('team-1')).toBe(2);
      expect(client.getTeamScore('team-3')).toBe(450);
      expect(fetchSnapshot).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. EVENT VERSION GAPS
  // ---------------------------------------------------------------------------
  describe('Event Version Gaps', () => {
    it('client has version 100, receives version 103 -> detects gap and fetches authoritative snapshot', async () => {
      // Client is at version 100
      const snapshotAt100: LeaderboardSnapshot = {
        leaderboardVersion: 100,
        updatedAt: new Date().toISOString(),
        totalTeams: 2,
        entries: [
          { rank: 1, teamId: 'team-1', teamName: 'Team 1', score: 1000, lastScoreAt: '2026-09-22T10:00:00.000Z' },
          { rank: 2, teamId: 'team-2', teamName: 'Team 2', score: 800, lastScoreAt: '2026-09-22T10:05:00.000Z' },
        ],
      };

      // Authoritative state at version 103 after missed events 101 and 102
      const snapshotAt103: LeaderboardSnapshot = {
        leaderboardVersion: 103,
        updatedAt: new Date().toISOString(),
        totalTeams: 2,
        entries: [
          { rank: 1, teamId: 'team-2', teamName: 'Team 2', score: 1200, lastScoreAt: '2026-09-22T10:15:00.000Z' },
          { rank: 2, teamId: 'team-1', teamName: 'Team 1', score: 1000, lastScoreAt: '2026-09-22T10:00:00.000Z' },
        ],
      };

      const fetchSnapshot = vi.fn(async () => snapshotAt103);
      const client = new LeaderboardClient({ fetchSnapshot });

      client.applySnapshot(snapshotAt100);
      expect(client.getVersion()).toBe(100);

      // Event version 103 arrives (events 101 and 102 were lost or dropped by network)
      const event103: LeaderboardEventPayload = {
        eventId: 'event-uuid-103',
        eventType: 'checkpoint_solve',
        teamId: 'team-2',
        teamName: 'Team 2',
        score: 1200,
        pointsDelta: 100,
        leaderboardVersion: 103,
        timestamp: '2026-09-22T10:15:00.000Z',
      };

      // Client processes event 103
      const result = await client.applyEvent(event103);

      // 1. Must detect gap (103 > 100 + 1)
      expect(result).toBe('gap_detected');

      // 2. Must trigger authoritative snapshot fetch
      expect(fetchSnapshot).toHaveBeenCalledTimes(1);

      // 3. Must converge to version 103 and authoritative team ranks
      expect(client.getVersion()).toBe(103);
      expect(client.getTeamRank('team-2')).toBe(1);
      expect(client.getTeamScore('team-2')).toBe(1200);
    });
  });
});
