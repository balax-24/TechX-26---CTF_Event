import React from 'react';
import { useLeaderboard } from '../contexts/LeaderboardContext';
import { LeaderboardTable } from '../components/leaderboard/LeaderboardTable';
import { LoadingSkeleton, EmptyState } from '../components/feedback/FeedbackStates';
import { Button } from '../components/common/Button';

export const LeaderboardPage: React.FC = () => {
  const {
    entries,
    leaderboardVersion,
    isConnected,
    isReconnecting,
    isLoading,
    refreshSnapshot,
  } = useLeaderboard();

  return (
    <div className="container" style={{ padding: '32px 16px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
        }}
      >
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl, 1.5rem)', marginBottom: '4px' }}>
            Live Leaderboard
          </h1>
          <p style={{ fontSize: 'var(--text-sm, 0.875rem)' }}>
            Real-time standings with authoritative monotonic ledger synchronization.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refreshSnapshot()}
        >
          🔄 Refresh Snapshot
        </Button>
      </div>

      {/* Main Content */}
      {isLoading ? (
        <LoadingSkeleton rows={8} height="52px" />
      ) : entries.length === 0 ? (
        <EmptyState
          title="No scores recorded yet"
          message="Standings will populate as teams solve challenges and checkpoints."
          icon="🏆"
        />
      ) : (
        <LeaderboardTable
          entries={entries}
          isConnected={isConnected}
          isReconnecting={isReconnecting}
          version={leaderboardVersion}
        />
      )}
    </div>
  );
};
