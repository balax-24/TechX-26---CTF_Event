import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { LeaderboardProvider, useLeaderboard } from '../../src/contexts/LeaderboardContext';
import { AuthProvider } from '../../src/contexts/AuthContext';
import { ToastProvider } from '../../src/contexts/ToastContext';
import { leaderboardApi } from '../../src/api/leaderboard';

vi.mock('../../src/api/leaderboard', () => ({
  leaderboardApi: {
    getSnapshot: vi.fn(),
    getStreamUrl: vi.fn().mockReturnValue('/api/v1/leaderboard/stream'),
  },
}));

vi.mock('../../src/api/auth', () => ({
  authApi: {
    getCsrf: vi.fn().mockResolvedValue('csrf-token'),
    getProfile: vi.fn().mockResolvedValue({
      success: true,
      user: { id: 'u-1', username: 'alice', role: 'participant' },
      team: { id: 't-1', name: 'Alpha', score: 100 },
    }),
  },
}));

// Mock EventSource
class MockEventSource {
  static instances: MockEventSource[] = [];
  listeners: Record<string, ((e: any) => void)[]> = {};
  url: string;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
    setTimeout(() => {
      if (this.onopen) this.onopen({} as any);
    }, 0);
  }

  onopen: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;

  addEventListener(event: string, cb: (e: any) => void) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  }

  simulateEvent(event: string, data: any) {
    const list = this.listeners[event] || [];
    list.forEach((cb) => cb({ data: JSON.stringify(data) }));
  }

  close() {
    this.listeners = {};
  }
}

// @ts-ignore
global.EventSource = MockEventSource as any;

const LeaderboardConsumer: React.FC = () => {
  const { entries, leaderboardVersion, isConnected } = useLeaderboard();

  return (
    <div>
      <div data-testid="version">{leaderboardVersion}</div>
      <div data-testid="connected">{isConnected ? 'CONNECTED' : 'DISCONNECTED'}</div>
      <ul>
        {entries.map((e) => (
          <li key={e.teamId} data-testid={`team-${e.teamId}`}>
            {e.rank}. {e.teamName} - {e.score} pts
          </li>
        ))}
      </ul>
    </div>
  );
};

describe('Leaderboard Realtime SSE & Monotonic Gap Recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockEventSource.instances = [];
  });

  it('loads initial snapshot and handles contiguous real-time updates', async () => {
    vi.mocked(leaderboardApi.getSnapshot).mockResolvedValueOnce({
      leaderboardVersion: 10,
      updatedAt: new Date().toISOString(),
      totalTeams: 2,
      entries: [
        { rank: 1, teamId: 't-1', teamName: 'Alpha', score: 200, lastScoreAt: '2026-01-01T10:00:00Z' },
        { rank: 2, teamId: 't-2', teamName: 'Beta', score: 100, lastScoreAt: '2026-01-01T10:00:00Z' },
      ],
    });

    render(
      <ToastProvider>
        <AuthProvider>
          <LeaderboardProvider>
            <LeaderboardConsumer />
          </LeaderboardProvider>
        </AuthProvider>
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('version')).toHaveTextContent('10');
    });

    expect(screen.getByTestId('team-t-1')).toHaveTextContent('1. Alpha - 200 pts');
    expect(screen.getByTestId('team-t-2')).toHaveTextContent('2. Beta - 100 pts');

    // Wait for SSE instance to be connected
    await waitFor(() => {
      expect(MockEventSource.instances.length).toBeGreaterThan(0);
    });
    const es = MockEventSource.instances[0];

    // Simulate contiguous event: version 11 (Beta scores +150 -> 250 and takes rank 1)
    act(() => {
      es.simulateEvent('leaderboard_update', {
        eventId: 'ev-1',
        eventType: 'final_solve',
        teamId: 't-2',
        teamName: 'Beta',
        score: 250,
        pointsDelta: 150,
        leaderboardVersion: 11,
        timestamp: '2026-01-01T10:05:00Z',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('version')).toHaveTextContent('11');
    });

    // Beta should now be rank 1 with 250 pts, Alpha rank 2 with 200 pts
    expect(screen.getByTestId('team-t-2')).toHaveTextContent('1. Beta - 250 pts');
    expect(screen.getByTestId('team-t-1')).toHaveTextContent('2. Alpha - 200 pts');
  });

  it('safely ignores duplicate or older version events', async () => {
    vi.mocked(leaderboardApi.getSnapshot).mockResolvedValueOnce({
      leaderboardVersion: 20,
      updatedAt: new Date().toISOString(),
      totalTeams: 1,
      entries: [{ rank: 1, teamId: 't-1', teamName: 'Alpha', score: 300, lastScoreAt: '2026-01-01T10:00:00Z' }],
    });

    render(
      <ToastProvider>
        <AuthProvider>
          <LeaderboardProvider>
            <LeaderboardConsumer />
          </LeaderboardProvider>
        </AuthProvider>
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('version')).toHaveTextContent('20');
    });

    const es = MockEventSource.instances[0];

    // Send duplicate event with version 20 (or older version 19)
    act(() => {
      es.simulateEvent('leaderboard_update', {
        eventId: 'ev-old',
        eventType: 'final_solve',
        teamId: 't-1',
        teamName: 'Alpha',
        score: 999, // Should NOT be applied
        pointsDelta: 699,
        leaderboardVersion: 19,
        timestamp: '2026-01-01T09:00:00Z',
      });
    });

    // Version remains 20 and score remains 300
    expect(screen.getByTestId('version')).toHaveTextContent('20');
    expect(screen.getByTestId('team-t-1')).toHaveTextContent('1. Alpha - 300 pts');
  });

  it('triggers authoritative snapshot recovery when a version gap is detected', async () => {
    vi.mocked(leaderboardApi.getSnapshot)
      .mockResolvedValueOnce({
        leaderboardVersion: 50,
        updatedAt: new Date().toISOString(),
        totalTeams: 1,
        entries: [{ rank: 1, teamId: 't-1', teamName: 'Alpha', score: 100, lastScoreAt: '2026-01-01T10:00:00Z' }],
      })
      .mockResolvedValueOnce({
        leaderboardVersion: 53,
        updatedAt: new Date().toISOString(),
        totalTeams: 2,
        entries: [
          { rank: 1, teamId: 't-2', teamName: 'Gamma', score: 400, lastScoreAt: '2026-01-01T10:12:00Z' },
          { rank: 2, teamId: 't-1', teamName: 'Alpha', score: 100, lastScoreAt: '2026-01-01T10:00:00Z' },
        ],
      });

    render(
      <ToastProvider>
        <AuthProvider>
          <LeaderboardProvider>
            <LeaderboardConsumer />
          </LeaderboardProvider>
        </AuthProvider>
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('version')).toHaveTextContent('50');
    });

    const es = MockEventSource.instances[0];

    // Simulate gap: current is 50, incoming is 53 (missed 51, 52)
    act(() => {
      es.simulateEvent('leaderboard_update', {
        eventId: 'ev-gap',
        eventType: 'final_solve',
        teamId: 't-2',
        teamName: 'Gamma',
        score: 400,
        pointsDelta: 400,
        leaderboardVersion: 53,
        timestamp: '2026-01-01T10:12:00Z',
      });
    });

    // Verify snapshot recovery was triggered
    await waitFor(() => {
      expect(leaderboardApi.getSnapshot).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId('version')).toHaveTextContent('53');
    });

    expect(screen.getByTestId('team-t-2')).toHaveTextContent('1. Gamma - 400 pts');
  });
});
