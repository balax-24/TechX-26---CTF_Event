import React from 'react';
import { LeaderboardEntry } from '../../types/api';
import { useAuth } from '../../contexts/AuthContext';
import { Badge } from '../common/Badge';

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

  const getRankBadge = (rank: number) => {
    if (rank === 1) return <span style={{ color: '#FBBF24', fontWeight: 800 }}>🥇 1</span>;
    if (rank === 2) return <span style={{ color: '#E2E8F0', fontWeight: 800 }}>🥈 2</span>;
    if (rank === 3) return <span style={{ color: '#CD7F32', fontWeight: 800 }}>🥉 3</span>;
    return <span style={{ color: 'var(--color-text-secondary, #94A3B8)', fontWeight: 600 }}>#{rank}</span>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Realtime Stream Status Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 'var(--text-xs, 0.75rem)',
          color: 'var(--color-text-muted, #64748B)',
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
              boxShadow: isConnected ? '0 0 8px #10B981' : undefined,
            }}
          />
          <span>
            {isConnected
              ? 'Real-Time Sync Active'
              : isReconnecting
              ? 'Reconnecting to stream...'
              : 'Offline (Viewing snapshot)'}
          </span>
        </div>
        <div className="font-mono">LEDGER V{version}</div>
      </div>

      {/* Table Container */}
      <div
        style={{
          overflowX: 'auto',
          backgroundColor: 'var(--color-surface, #161926)',
          border: '1px solid var(--color-border, #262B3F)',
          borderRadius: 'var(--radius-lg, 12px)',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            textAlign: 'left',
            fontSize: 'var(--text-sm, 0.875rem)',
          }}
        >
          <thead>
            <tr
              style={{
                borderBottom: '1px solid var(--color-border, #262B3F)',
                color: 'var(--color-text-muted, #64748B)',
                fontSize: 'var(--text-xs, 0.75rem)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              <th style={{ padding: '16px 20px', width: '80px' }}>Rank</th>
              <th style={{ padding: '16px 20px' }}>Team</th>
              <th style={{ padding: '16px 20px', textAlign: 'right' }}>Score</th>
              <th style={{ padding: '16px 20px', textAlign: 'right' }}>Last Activity</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const isCurrentTeam = team && team.id === entry.teamId;

              return (
                <tr
                  key={entry.teamId}
                  style={{
                    borderBottom: '1px solid var(--color-border, #262B3F)',
                    backgroundColor: isCurrentTeam
                      ? 'var(--color-brand-muted, rgba(106, 27, 154, 0.15))'
                      : 'transparent',
                    transition: 'background-color var(--transition-fast)',
                  }}
                >
                  <td style={{ padding: '16px 20px' }}>{getRankBadge(entry.rank)}</td>
                  <td style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          fontWeight: isCurrentTeam ? 700 : 500,
                          color: isCurrentTeam
                            ? 'var(--color-brand-bright, #BA68C8)'
                            : 'var(--color-text, #F8FAFC)',
                        }}
                      >
                        {entry.teamName}
                      </span>
                      {isCurrentTeam && (
                        <Badge variant="brand" size="sm">
                          YOU
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td
                    className="font-mono"
                    style={{
                      padding: '16px 20px',
                      textAlign: 'right',
                      fontWeight: 700,
                      color: 'var(--color-brand-bright, #BA68C8)',
                    }}
                  >
                    {entry.score}
                  </td>
                  <td
                    style={{
                      padding: '16px 20px',
                      textAlign: 'right',
                      color: 'var(--color-text-muted, #64748B)',
                      fontSize: 'var(--text-xs, 0.75rem)',
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
