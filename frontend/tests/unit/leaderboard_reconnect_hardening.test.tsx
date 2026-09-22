import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { LeaderboardProvider, useLeaderboard } from '../../src/contexts/LeaderboardContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { leaderboardApi } from '../../src/api/leaderboard';

vi.mock('../../src/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

// Mock MockEventSource
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  options?: any;
  readyState: number = 0; // 0 = CONNECTING, 1 = OPEN, 2 = CLOSED
  listeners: Record<string, ((event: any) => void)[]> = {};
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string, options?: any) {
    this.url = url;
    this.options = options;
    this.readyState = 1; // Open immediately
    MockEventSource.instances.push(this);
    setTimeout(() => {
      if (this.onopen) this.onopen();
    }, 10);
  }

  addEventListener(event: string, callback: (event: any) => void) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  removeEventListener(event: string, callback: (event: any) => void) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter((cb) => cb !== callback);
    }
  }

  emit(event: string, data: any) {
    const handlers = this.listeners[event] || [];
    handlers.forEach((h) => h({ data: JSON.stringify(data) }));
  }

  close() {
    this.readyState = 2; // CLOSED
  }
}

const TestConsumer: React.FC = () => {
  const { entries, leaderboardVersion, isConnected, isReconnecting, isLoading } = useLeaderboard();

  return (
    <div>
      <div data-testid="status">{isConnected ? 'CONNECTED' : isReconnecting ? 'RECONNECTING' : 'DISCONNECTED'}</div>
      <div data-testid="version">{leaderboardVersion}</div>
      <div data-testid="loading">{isLoading ? 'LOADING' : 'READY'}</div>
      <ul data-testid="leaderboard-list">
        {entries.map((e) => (
          <li key={e.teamId} data-testid={`team-${e.teamId}`}>
            Rank {e.rank}: {e.teamName} - {e.score} pts
          </li>
        ))}
      </ul>
    </div>
  );
};

const setupAuthMock = (isAuthenticated = true, userRole = 'participant') => {
  vi.mocked(useAuth).mockReturnValue({
    user: isAuthenticated ? ({ id: 'u1', username: 'alice', role: userRole } as any) : null,
    team: isAuthenticated ? ({ id: 't1', name: 'Team Alpha', score: 100 } as any) : null,
    isLoading: false,
    isAuthenticated,
    isAdmin: userRole === 'admin',
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshProfile: vi.fn(),
    setTeam: vi.fn(),
  });
};

describe('Stage 7 Hardening: Leaderboard SSE & Reconnect Lifecycle', () => {
  const originalEventSource = global.EventSource;

  beforeEach(() => {
    MockEventSource.instances = [];
    (global as any).EventSource = MockEventSource;
    (EventSource as any).CONNECTING = 0;
    (EventSource as any).OPEN = 1;
    (EventSource as any).CLOSED = 2;

    vi.spyOn(leaderboardApi, 'getSnapshot').mockResolvedValue({
      leaderboardVersion: 1,
      updatedAt: new Date().toISOString(),
      entries: [
        {
          rank: 1,
          teamId: 't1',
          teamName: 'Team Alpha',
          score: 100,
          solvedCount: 1,
          lastScoreAt: new Date().toISOString(),
        },
      ],
    });
  });

  afterEach(() => {
    global.EventSource = originalEventSource;
    vi.restoreAllMocks();
  });

  it('loads initial snapshot and maintains exactly ONE EventSource connection', async () => {
    setupAuthMock(true);

    render(
      <LeaderboardProvider>
        <TestConsumer />
      </LeaderboardProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('READY');
      expect(screen.getByTestId('version').textContent).toBe('1');
      expect(screen.getByTestId('team-t1').textContent).toContain('Team Alpha - 100 pts');
    });

    expect(MockEventSource.instances.length).toBe(1);
  });

  it('applies contiguous real-time updates and ignores stale/duplicate events', async () => {
    setupAuthMock(true);

    render(
      <LeaderboardProvider>
        <TestConsumer />
      </LeaderboardProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('version').textContent).toBe('1');
    });

    const esInstance = MockEventSource.instances[0];

    // 1. Send contiguous next version V=2
    act(() => {
      esInstance.emit('leaderboard_update', {
        leaderboardVersion: 2,
        teamId: 't2',
        teamName: 'Team Beta',
        score: 250,
        timestamp: new Date().toISOString(),
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('version').textContent).toBe('2');
      expect(screen.getByTestId('team-t2').textContent).toContain('Team Beta - 250 pts');
      expect(screen.getByTestId('team-t2').textContent).toContain('Rank 1');
      expect(screen.getByTestId('team-t1').textContent).toContain('Rank 2');
    });

    // 2. Send duplicate/stale event V=2
    act(() => {
      esInstance.emit('leaderboard_update', {
        leaderboardVersion: 2,
        teamId: 't2',
        teamName: 'Team Beta',
        score: 999, // Fake score
        timestamp: new Date().toISOString(),
      });
    });

    // Score must NOT be modified by stale/duplicate version
    expect(screen.getByTestId('version').textContent).toBe('2');
    expect(screen.getByTestId('team-t2').textContent).toContain('Team Beta - 250 pts');
  });

  it('triggers snapshot recovery when a version gap is detected', async () => {
    setupAuthMock(true);

    const snapshotSpy = vi.spyOn(leaderboardApi, 'getSnapshot').mockResolvedValueOnce({
      leaderboardVersion: 1,
      updatedAt: new Date().toISOString(),
      entries: [
        {
          rank: 1,
          teamId: 't1',
          teamName: 'Team Alpha',
          score: 100,
          solvedCount: 1,
          lastScoreAt: new Date().toISOString(),
        },
      ],
    });

    render(
      <LeaderboardProvider>
        <TestConsumer />
      </LeaderboardProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('version').textContent).toBe('1');
    });

    // Setup snapshot recovery mock for gap recovery
    snapshotSpy.mockResolvedValueOnce({
      leaderboardVersion: 5,
      updatedAt: new Date().toISOString(),
      entries: [
        {
          rank: 1,
          teamId: 't3',
          teamName: 'Team Gamma',
          score: 500,
          solvedCount: 3,
          lastScoreAt: new Date().toISOString(),
        },
      ],
    });

    const esInstance = MockEventSource.instances[0];

    // Emit event with gap: current is 1, incoming is 5
    act(() => {
      esInstance.emit('leaderboard_update', {
        leaderboardVersion: 5,
        teamId: 't3',
        teamName: 'Team Gamma',
        score: 500,
        timestamp: new Date().toISOString(),
      });
    });

    // Verifies snapshot recovery was triggered
    await waitFor(() => {
      expect(snapshotSpy).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId('version').textContent).toBe('5');
      expect(screen.getByTestId('team-t3').textContent).toContain('Team Gamma - 500 pts');
    });
  });

  it('updates connection state to RECONNECTING when connection drops', async () => {
    setupAuthMock(true);

    render(
      <LeaderboardProvider>
        <TestConsumer />
      </LeaderboardProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('CONNECTED');
    });

    const esInstance = MockEventSource.instances[0];

    // Simulate connection drop (browser EventSource goes to CONNECTING state)
    act(() => {
      esInstance.readyState = 0; // EventSource.CONNECTING
      if (esInstance.onerror) esInstance.onerror();
    });

    expect(screen.getByTestId('status').textContent).toBe('RECONNECTING');

    // Simulate reconnection success
    act(() => {
      esInstance.readyState = 1; // EventSource.OPEN
      if (esInstance.onopen) esInstance.onopen();
    });

    expect(screen.getByTestId('status').textContent).toBe('CONNECTED');
  });

  it('closes EventSource when user is unauthenticated (logout)', async () => {
    setupAuthMock(false);

    const { unmount } = render(
      <LeaderboardProvider>
        <TestConsumer />
      </LeaderboardProvider>
    );

    expect(MockEventSource.instances.length).toBe(0); // Never opened for unauthenticated users

    unmount();
  });
});
