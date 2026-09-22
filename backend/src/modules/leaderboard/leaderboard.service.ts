import { eq, count, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { teams, scoreEvents, scoreEventOutbox } from '../../db/schema.js';
import { compareTeamRanks } from '../scoring/scoring.service.js';

export interface LeaderboardEntry {
  rank: number;
  teamId: string;
  teamName: string;
  score: number;
  lastScoreAt: string;
}

export interface LeaderboardSnapshot {
  leaderboardVersion: number;
  updatedAt: string;
  totalTeams: number;
  entries: LeaderboardEntry[];
}

export class LeaderboardService {
  /**
   * Fetches the authoritative, server-calculated leaderboard snapshot.
   * Ranking rules:
   * 1. score DESC
   * 2. last_score_at ASC (earlier solve breaks ties)
   * 3. id ASC (immutable unique identifier final tie-breaker)
   */
  async getLeaderboardSnapshot(): Promise<LeaderboardSnapshot> {
    // 1. Authoritative monotonic leaderboard version derived from PostgreSQL sequence / outbox ledger
    let leaderboardVersion = 0;
    try {
      const result: any = await db.execute(
        sql`SELECT COALESCE(MAX(leaderboard_version), 0)::bigint AS max_version FROM score_event_outbox`
      );
      const row = result?.rows?.[0] || result?.[0];
      leaderboardVersion = Number(row?.max_version || 0);
    } catch {
      const [eventCountResult] = await db
        .select({ totalEvents: count() })
        .from(scoreEvents);
      leaderboardVersion = eventCountResult?.totalEvents || 0;
    }

    // 2. Fetch all unbanned teams
    const allTeams = await db
      .select({
        id: teams.id,
        name: teams.name,
        score: teams.score,
        lastScoreAt: teams.lastScoreAt,
      })
      .from(teams)
      .where(eq(teams.isBanned, false));

    // 3. Sort teams deterministically using canonical tie-breaker
    allTeams.sort((a, b) => compareTeamRanks(a, b));

    // 4. Map to public-safe leaderboard entries with 1-based ranks
    const entries: LeaderboardEntry[] = allTeams.map((t, idx) => ({
      rank: idx + 1,
      teamId: t.id,
      teamName: t.name,
      score: t.score,
      lastScoreAt: t.lastScoreAt.toISOString(),
    }));

    return {
      leaderboardVersion,
      updatedAt: new Date().toISOString(),
      totalTeams: entries.length,
      entries,
    };
  }
}

export const leaderboardService = new LeaderboardService();
