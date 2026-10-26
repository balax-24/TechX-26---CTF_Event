import React from 'react';
import { LeaderboardEntry } from '../../types/api';
import { useAuth } from '../../contexts/AuthContext';

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  isConnected: boolean;
  isReconnecting: boolean;
  version: number;
}

export const LeaderboardTable: React.FC<LeaderboardTableProps> = ({
  entries,
  isConnected,
  isReconnecting,
  version,
}) => {
  const { team } = useAuth();

  const renderRank = (rank: number) => {
    const formatted = `#${String(rank).padStart(2, '0')}`;
    if (rank === 1) {
      return (
        <span
          className="font-mono"
          style={{
            fontWeight: 800,
            color: '#EAB308',
            backgroundColor: 'rgba(234, 179, 8, 0.1)',
            padding: '2px 8px',
            border: '1px solid rgba(234, 179, 8, 0.3)',
            borderRadius: '2px',
          }}
        >
          {formatted}
        </span>
      );
    }
    if (rank === 2) {
      return (
        <span
          className="font-mono"
          style={{
            fontWeight: 800,
            color: '#E2E8F0',
            backgroundColor: 'rgba(226, 232, 240, 0.1)',
            padding: '2px 8px',
            border: '1px solid rgba(226, 232, 240, 0.3)',
            borderRadius: '2px',
          }}
        >
          {formatted}
        </span>
      );
    }
    if (rank === 3) {
      return (
        <span
          className="font-mono"
          style={{
            fontWeight: 800,
            color: '#F59E0B',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            padding: '2px 8px',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '2px',
          }}
        >
          {formatted}
        </span>
      );
    }
    return (
      <span className="font-mono" style={{ color: 'var(--color-text-muted, #5A657D)', fontWeight: 600 }}>
        {formatted}
      </span>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Realtime Stream Status Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.75rem',
          padding: '8px 12px',
          backgroundColor: 'var(--color-surface, #11141D)',
          border: '1px solid var(--color-border, #1E2335)',
          borderRadius: '2px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: isConnected
                ? 'var(--color-success, #10B981)'
                : isReconnecting
                ? 'var(--color-warning, #F59E0B)'
                : 'var(--color-danger, #EF4444)',
              boxShadow: isConnected ? '0 0 6px #10B981' : undefined,
            }}
          />
          <span className="font-mono" style={{ color: 'var(--color-text-secondary, #94A3B8)' }}>
            {isConnected
              ? 'STREAM: REAL-TIME SSE CONNECTED'
              : isReconnecting
              ? 'STREAM: RECONNECTING TO LEDGER...'
              : 'STREAM: OFFLINE (VIEWING SNAPSHOT)'}
          </span>
        </div>
        <div className="font-mono" style={{ color: 'var(--color-text-muted, #5A657D)' }}>
          AUTHORITATIVE LEDGER V{version}
        </div>
      </div>

      {/* Leaderboard Table Container */}
      <div
        style={{
          overflowX: 'auto',
          backgroundColor: 'var(--color-surface, #11141D)',
          border: '1px solid var(--color-border, #1E2335)',
          borderRadius: 'var(--radius-sm, 2px)',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            textAlign: 'left',
            fontSize: '0.8125rem',
            minWidth: '560px',
          }}
        >
          <thead>
            <tr
              className="font-mono"
              style={{
                borderBottom: '1px solid var(--color-border, #1E2335)',
                backgroundColor: 'var(--color-surface-sunken, #080A0F)',
                color: 'var(--color-text-muted, #5A657D)',
                fontSize: '0.6875rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              <th style={{ padding: '12px 18px', width: '90px' }}>RANK</th>
              <th style={{ padding: '12px 18px' }}>TEAM</th>
              <th style={{ padding: '12px 18px', textAlign: 'right', width: '130px' }}>SCORE</th>
              <th style={{ padding: '12px 18px', textAlign: 'right', width: '150px' }}>LAST SOLVE</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const isCurrentTeam = team && team.id === entry.teamId;

              return (
                <tr
                  key={entry.teamId}
                  style={{
                    borderBottom: '1px solid var(--color-border, #1E2335)',
                    backgroundColor: isCurrentTeam ? 'rgba(106, 27, 154, 0.12)' : 'transparent',
                    borderLeft: isCurrentTeam
                      ? '3px solid var(--color-brand-bright, #BA68C8)'
                      : '3px solid transparent',
                    transition: 'background-color 0.15s ease',
                  }}
                >
                  <td style={{ padding: '12px 18px' }}>{renderRank(entry.rank)}</td>
                  <td style={{ padding: '12px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          fontWeight: isCurrentTeam ? 700 : 600,
                          color: isCurrentTeam ? '#FFFFFF' : '#E2E8F0',
                          fontSize: '0.875rem',
                        }}
                      >
                        {entry.teamName}
                      </span>
                      {isCurrentTeam && (
                        <span
                          className="font-mono"
                          style={{
                            fontSize: '0.625rem',
                            fontWeight: 700,
                            padding: '1px 6px',
                            backgroundColor: 'var(--color-brand, #6A1B9A)',
                            color: '#FFFFFF',
                            borderRadius: '2px',
                          }}
                        >
                          YOU
                        </span>
                      )}
                    </div>
                  </td>
                  <td
                    className="font-mono"
                    style={{
                      padding: '12px 18px',
                      textAlign: 'right',
                      fontWeight: 800,
                      color: isCurrentTeam
                        ? 'var(--color-brand-bright, #BA68C8)'
                        : '#F8FAFC',
                    }}
                  >
                    {entry.score}{' '}
                    <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted, #5A657D)' }}>
                      PTS
                    </span>
                  </td>
                  <td
                    className="font-mono"
                    style={{
                      padding: '12px 18px',
                      textAlign: 'right',
                      color: 'var(--color-text-muted, #5A657D)',
                      fontSize: '0.75rem',
                    }}
                  >
                    {entry.lastScoreAt
                      ? new Date(entry.lastScoreAt).toLocaleTimeString()
                      : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
