import React from 'react';
import { useLeaderboard } from '../contexts/LeaderboardContext';
import { LeaderboardTable } from '../components/leaderboard/LeaderboardTable';
import { LoadingSkeleton } from '../components/feedback/FeedbackStates';

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
    <div className="container" style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          paddingBottom: '16px',
          borderBottom: '1px solid var(--color-border, #1E2335)',
        }}
      >
        <div>
          <div
            className="font-mono"
            style={{
              fontSize: '0.6875rem',
              fontWeight: 700,
              color: 'var(--color-brand-bright, #BA68C8)',
              letterSpacing: '0.12em',
              marginBottom: '4px',
            }}
          >
            AUTHORITATIVE STANDINGS
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: '#F8FAFC' }}>
            LEADERBOARD
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => refreshSnapshot()}
            className="font-mono"
            style={{
              padding: '6px 14px',
              fontSize: '0.75rem',
              fontWeight: 700,
              backgroundColor: 'var(--color-surface, #11141D)',
              border: '1px solid var(--color-border, #1E2335)',
              borderRadius: '2px',
              color: 'var(--color-text-secondary, #94A3B8)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#FFFFFF';
              e.currentTarget.style.borderColor = 'var(--color-brand, #6A1B9A)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-text-secondary, #94A3B8)';
              e.currentTarget.style.borderColor = 'var(--color-border, #1E2335)';
            }}
          >
            [ RESYNC SNAPSHOT ]
          </button>
        </div>
      </div>

      {/* Main Content */}
      {isLoading ? (
        <div style={{ padding: '16px 0' }}>
          <LoadingSkeleton rows={8} height="48px" />
        </div>
      ) : entries.length === 0 ? (
        <div
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            backgroundColor: 'var(--color-surface, #11141D)',
            border: '1px dashed var(--color-border, #1E2335)',
            borderRadius: '2px',
          }}
        >
          <div
            className="font-mono"
            style={{
              fontSize: '0.8125rem',
              fontWeight: 700,
              color: 'var(--color-brand-bright, #BA68C8)',
              marginBottom: '6px',
            }}
          >
            [ AUTHORITATIVE LEDGER EMPTY ]
          </div>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary, #94A3B8)', margin: 0 }}>
            No scores have been committed to the ledger yet. Standings will automatically populate as teams solve challenges.
          </p>
        </div>
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
