import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { LeaderboardEntry, LeaderboardSnapshot, LeaderboardUpdateEvent } from '../types/api';
import { leaderboardApi } from '../api/leaderboard';
import { useAuth } from './AuthContext';

interface LeaderboardContextType {
  entries: LeaderboardEntry[];
  leaderboardVersion: number;
  lastUpdatedAt: string;
  isConnected: boolean;
  isReconnecting: boolean;
  isLoading: boolean;
  refreshSnapshot: () => Promise<void>;
}

const LeaderboardContext = createContext<LeaderboardContextType | undefined>(undefined);

// Deterministic ranking tie-breaker matching backend Stage 4/5:
// 1. score DESC
// 2. lastScoreAt ASC (earliest solve wins)
// 3. teamId ASC (lexicographical UUID fallback)
function compareRanks(a: LeaderboardEntry, b: LeaderboardEntry): number {
  if (b.score !== a.score) {
    return b.score - a.score;
  }
  const timeA = new Date(a.lastScoreAt).getTime() || 0;
  const timeB = new Date(b.lastScoreAt).getTime() || 0;
  if (timeA !== timeB) {
    return timeA - timeB;
  }
  return a.teamId.localeCompare(b.teamId);
}

export const LeaderboardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [leaderboardVersion, setLeaderboardVersion] = useState<number>(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string>(new Date().toISOString());
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const currentVersionRef = useRef<number>(0);

  // Sync ref with state
  useEffect(() => {
    currentVersionRef.current = leaderboardVersion;
  }, [leaderboardVersion]);

  // Authoritative snapshot fetcher
  const refreshSnapshot = useCallback(async () => {
    try {
      const snapshot: LeaderboardSnapshot = await leaderboardApi.getSnapshot();
      const sorted = [...snapshot.entries].sort(compareRanks).map((e, idx) => ({
        ...e,
        rank: idx + 1,
      }));
      setEntries(sorted);
      setLeaderboardVersion(snapshot.leaderboardVersion);
      setLastUpdatedAt(snapshot.updatedAt || new Date().toISOString());
      currentVersionRef.current = snapshot.leaderboardVersion;
    } catch {
      // Retain existing state if fetch fails
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle incoming individual score update event
  const handleScoreUpdate = useCallback(
    (event: LeaderboardUpdateEvent) => {
      const incomingVer = event.leaderboardVersion;
      const curVer = currentVersionRef.current;

      // 1. Duplicate or old event -> safely discard
      if (incomingVer <= curVer) {
        return;
      }

      // 2. Version gap detected (e.g., missed an event during brief blip)
      if (incomingVer > curVer + 1) {
        // Trigger immediate snapshot recovery to re-synchronize authoritative state
        refreshSnapshot();
        return;
      }

      // 3. Contiguous monotonic next version -> apply deterministically
      setEntries((prev) => {
        let found = false;
        const updated = prev.map((entry) => {
          if (entry.teamId === event.teamId) {
            found = true;
            return {
              ...entry,
              teamName: event.teamName || entry.teamName,
              score: event.score,
              lastScoreAt: event.timestamp || new Date().toISOString(),
            };
          }
          return entry;
        });

        if (!found) {
          updated.push({
            rank: prev.length + 1,
            teamId: event.teamId,
            teamName: event.teamName,
            score: event.score,
            lastScoreAt: event.timestamp || new Date().toISOString(),
          });
        }

        updated.sort(compareRanks);
        return updated.map((item, idx) => ({ ...item, rank: idx + 1 }));
      });

      setLeaderboardVersion(incomingVer);
      setLastUpdatedAt(event.timestamp || new Date().toISOString());
      currentVersionRef.current = incomingVer;
    },
    [refreshSnapshot]
  );

  // Connect to SSE stream
  const connectSSE = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (!isAuthenticated) return;

    // Clean up any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const streamUrl = leaderboardApi.getStreamUrl();
    const es = new EventSource(streamUrl, { withCredentials: true });
    eventSourceRef.current = es;

    es.onopen = () => {
      setIsConnected(true);
      setIsReconnecting(false);
      reconnectAttemptsRef.current = 0;
    };

    // Full snapshot event sent on connection/reconnect
    es.addEventListener('leaderboard_snapshot', (e: MessageEvent) => {
      try {
        const snapshot: LeaderboardSnapshot = JSON.parse(e.data);
        const sorted = [...snapshot.entries].sort(compareRanks).map((item, idx) => ({
          ...item,
          rank: idx + 1,
        }));
        setEntries(sorted);
        setLeaderboardVersion(snapshot.leaderboardVersion);
        setLastUpdatedAt(snapshot.updatedAt || new Date().toISOString());
        currentVersionRef.current = snapshot.leaderboardVersion;
        setIsConnected(true);
        setIsReconnecting(false);
        setIsLoading(false);
      } catch {
        // Discard malformed snapshot
      }
    });

    // Real-time incremental score update event
    es.addEventListener('leaderboard_update', (e: MessageEvent) => {
      try {
        const eventData: LeaderboardUpdateEvent = JSON.parse(e.data);
        handleScoreUpdate(eventData);
      } catch {
        // Discard malformed update
      }
    });

    es.onerror = () => {
      setIsConnected(false);

      // In native browser EventSource, when connection drops, readyState is CONNECTING (0).
      // The browser natively reconnects and automatically transmits the Last-Event-ID header.
      // Do NOT call es.close() here as it would destroy the browser's native reconnection state.
      if (es.readyState === EventSource.CONNECTING) {
        setIsReconnecting(true);
        return;
      }

      // If readyState is CLOSED (2), native reconnection has terminated permanently.
      // Re-instantiate connection using bounded exponential backoff with jitter.
      setIsReconnecting(true);
      es.close();
      if (eventSourceRef.current === es) {
        eventSourceRef.current = null;
      }

      const attempt = reconnectAttemptsRef.current;
      const baseDelay = Math.min(1000 * Math.pow(2, attempt), 30000);
      const jitter = Math.random() * 500;
      const delay = baseDelay + jitter;

      reconnectAttemptsRef.current = attempt + 1;

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        connectSSE();
      }, delay);
    };
  }, [isAuthenticated, handleScoreUpdate]);

  // Initial mount: load snapshot always; if authenticated, start the single SSE stream
  useEffect(() => {
    refreshSnapshot();

    if (isAuthenticated) {
      connectSSE();
    } else {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      reconnectAttemptsRef.current = 0;
      setIsConnected(false);
      setIsReconnecting(false);
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      reconnectAttemptsRef.current = 0;
    };
  }, [isAuthenticated, connectSSE, refreshSnapshot]);

  return (
    <LeaderboardContext.Provider
      value={{
        entries,
        leaderboardVersion,
        lastUpdatedAt,
        isConnected,
        isReconnecting,
        isLoading,
        refreshSnapshot,
      }}
    >
      {children}
    </LeaderboardContext.Provider>
  );
};

export const useLeaderboard = (): LeaderboardContextType => {
  const context = useContext(LeaderboardContext);
  if (!context) {
    throw new Error('useLeaderboard must be used within a LeaderboardProvider');
  }
  return context;
};
