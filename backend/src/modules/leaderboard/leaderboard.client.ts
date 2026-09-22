import { LeaderboardSnapshot, LeaderboardEntry } from './leaderboard.service.js';
import { compareTeamRanks } from '../scoring/scoring.service.js';

export interface LeaderboardEventPayload {
  eventId: string;
  eventType: string;
  teamId: string;
  teamName: string;
  score: number;
  pointsDelta: number;
  leaderboardVersion: number;
  challengeTitle?: string;
  checkpointNumber?: number;
  timestamp: string;
}

export type SnapshotFetcher = () => Promise<LeaderboardSnapshot>;

export interface LeaderboardClientOptions {
  fetchSnapshot: SnapshotFetcher;
  maxProcessedEventsHistory?: number;
}

/**
 * Reference Browser / Frontend Leaderboard State Machine:
 * Manages local leaderboard state, applies incoming real-time SSE events,
 * detects version gaps, avoids duplicate mutations, and triggers snapshot convergence.
 */
export class LeaderboardClient {
  private currentVersion = 0;
  private entries: LeaderboardEntry[] = [];
  private processedEventIds = new Set<string>();
  private readonly maxHistory: number;
  private readonly fetchSnapshot: SnapshotFetcher;
  private isFetchingSnapshot = false;

  constructor(options: LeaderboardClientOptions) {
    this.fetchSnapshot = options.fetchSnapshot;
    this.maxHistory = options.maxProcessedEventsHistory || 1000;
  }

  /**
   * Initializes or replaces local state with authoritative server snapshot.
   */
  applySnapshot(snapshot: LeaderboardSnapshot): void {
    this.currentVersion = snapshot.leaderboardVersion;
    this.entries = [...snapshot.entries];
  }

  /**
   * Processes incoming real-time score event.
   * Returns:
   * - 'applied': event applied successfully to local state
   * - 'duplicate_ignored': duplicate eventId or older/same version ignored
   * - 'gap_detected': version gap detected; snapshot refresh initiated
   */
  async applyEvent(event: LeaderboardEventPayload): Promise<'applied' | 'duplicate_ignored' | 'gap_detected'> {
    // 1. Idempotency check: duplicate eventId check
    if (this.processedEventIds.has(event.eventId)) {
      return 'duplicate_ignored';
    }

    // 2. Monotonic version check: ignore older or current version events
    if (event.leaderboardVersion <= this.currentVersion) {
      this.recordProcessedEventId(event.eventId);
      return 'duplicate_ignored';
    }

    // 3. Gap detection: if event version is ahead of expected next version (currentVersion + 1)
    if (event.leaderboardVersion > this.currentVersion + 1) {
      await this.recoverViaSnapshot();
      return 'gap_detected';
    }

    // 4. Sequential event application: apply score mutation to local team entry
    this.recordProcessedEventId(event.eventId);
    this.currentVersion = event.leaderboardVersion;

    const existingIndex = this.entries.findIndex((e) => e.teamId === event.teamId);
    if (existingIndex >= 0) {
      this.entries[existingIndex] = {
        ...this.entries[existingIndex],
        score: event.score, // Absolute score from authoritative event
        lastScoreAt: event.timestamp,
      };
    } else {
      this.entries.push({
        rank: this.entries.length + 1,
        teamId: event.teamId,
        teamName: event.teamName,
        score: event.score,
        lastScoreAt: event.timestamp,
      });
    }

    // 5. Re-sort and re-rank entries deterministically
    this.reRankEntries();

    return 'applied';
  }

  /**
   * Recovers client state by fetching current authoritative snapshot.
   */
  async recoverViaSnapshot(): Promise<void> {
    if (this.isFetchingSnapshot) return;
    this.isFetchingSnapshot = true;
    try {
      const snapshot = await this.fetchSnapshot();
      this.applySnapshot(snapshot);
    } finally {
      this.isFetchingSnapshot = false;
    }
  }

  getVersion(): number {
    return this.currentVersion;
  }

  getEntries(): LeaderboardEntry[] {
    return [...this.entries];
  }

  getTeamScore(teamId: string): number | undefined {
    return this.entries.find((e) => e.teamId === teamId)?.score;
  }

  getTeamRank(teamId: string): number | undefined {
    return this.entries.find((e) => e.teamId === teamId)?.rank;
  }

  private recordProcessedEventId(eventId: string): void {
    this.processedEventIds.add(eventId);
    if (this.processedEventIds.size > this.maxHistory) {
      const first = this.processedEventIds.values().next().value;
      if (first) this.processedEventIds.delete(first);
    }
  }

  private reRankEntries(): void {
    this.entries.sort((a, b) =>
      compareTeamRanks(
        { id: a.teamId, name: a.teamName, score: a.score, lastScoreAt: new Date(a.lastScoreAt) },
        { id: b.teamId, name: b.teamName, score: b.score, lastScoreAt: new Date(b.lastScoreAt) }
      )
    );

    this.entries = this.entries.map((entry, idx) => ({
      ...entry,
      rank: idx + 1,
    }));
  }
}
