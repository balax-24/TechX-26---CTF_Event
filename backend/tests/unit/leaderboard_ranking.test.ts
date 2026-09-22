import { describe, it, expect } from 'vitest';
import { compareTeamRanks, RankedTeam } from '../../src/modules/scoring/scoring.service.js';

describe('Leaderboard Deterministic Ranking & Sanitization Tests', () => {
  it('ranks teams by score DESC as primary criterion', () => {
    const teams: RankedTeam[] = [
      { id: 't1', name: 'Team One', score: 100, lastScoreAt: new Date('2026-09-22T10:00:00Z') },
      { id: 't2', name: 'Team Two', score: 500, lastScoreAt: new Date('2026-09-22T10:00:00Z') },
      { id: 't3', name: 'Team Three', score: 250, lastScoreAt: new Date('2026-09-22T10:00:00Z') },
    ];

    teams.sort((a, b) => compareTeamRanks(a, b));

    expect(teams[0].id).toBe('t2'); // 500
    expect(teams[1].id).toBe('t3'); // 250
    expect(teams[2].id).toBe('t1'); // 100
  });

  it('ranks teams by earlier lastScoreAt ASC when scores are equal (FIFO rule)', () => {
    const teams: RankedTeam[] = [
      { id: 't-late', name: 'Late Team', score: 300, lastScoreAt: new Date('2026-09-22T10:05:00Z') },
      { id: 't-early', name: 'Early Team', score: 300, lastScoreAt: new Date('2026-09-22T09:45:00Z') },
      { id: 't-middle', name: 'Mid Team', score: 300, lastScoreAt: new Date('2026-09-22T10:00:00Z') },
    ];

    teams.sort((a, b) => compareTeamRanks(a, b));

    expect(teams[0].id).toBe('t-early');
    expect(teams[1].id).toBe('t-middle');
    expect(teams[2].id).toBe('t-late');
  });

  it('breaks ties deterministically using immutable UUID ASC when score and timestamp are identical', () => {
    const fixedTime = new Date('2026-09-22T10:00:00Z');
    const teams: RankedTeam[] = [
      { id: '00000000-0000-0000-0000-000000000003', name: 'Team 3', score: 400, lastScoreAt: fixedTime },
      { id: '00000000-0000-0000-0000-000000000001', name: 'Team 1', score: 400, lastScoreAt: fixedTime },
      { id: '00000000-0000-0000-0000-000000000002', name: 'Team 2', score: 400, lastScoreAt: fixedTime },
    ];

    teams.sort((a, b) => compareTeamRanks(a, b));

    expect(teams[0].id).toBe('00000000-0000-0000-0000-000000000001');
    expect(teams[1].id).toBe('00000000-0000-0000-0000-000000000002');
    expect(teams[2].id).toBe('00000000-0000-0000-0000-000000000003');
  });

  it('generates consistent 1-based ranks without gaps or non-determinism', () => {
    const rawTeams: RankedTeam[] = [
      { id: 't-b', name: 'Team B', score: 500, lastScoreAt: new Date('2026-09-22T10:00:00Z') },
      { id: 't-a', name: 'Team A', score: 500, lastScoreAt: new Date('2026-09-22T09:30:00Z') },
      { id: 't-c', name: 'Team C', score: 200, lastScoreAt: new Date('2026-09-22T10:15:00Z') },
    ];

    rawTeams.sort((a, b) => compareTeamRanks(a, b));

    const rankedEntries = rawTeams.map((t, idx) => ({
      rank: idx + 1,
      teamId: t.id,
      teamName: t.name,
      score: t.score,
    }));

    expect(rankedEntries[0].rank).toBe(1);
    expect(rankedEntries[0].teamName).toBe('Team A');

    expect(rankedEntries[1].rank).toBe(2);
    expect(rankedEntries[1].teamName).toBe('Team B');

    expect(rankedEntries[2].rank).toBe(3);
    expect(rankedEntries[2].teamName).toBe('Team C');
  });
});
