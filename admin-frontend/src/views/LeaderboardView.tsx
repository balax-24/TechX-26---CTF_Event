import React, { useEffect, useState } from 'react';
import { LeaderboardEntry } from '../types';
import { useAuth } from '../context/AuthContext';

export const LeaderboardView: React.FC = () => {
  const { csrfToken } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [version, setVersion] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch('/api/v1/admin/leaderboard');
      if (res.ok) {
        const json = await res.json();
        setEntries(json.entries || []);
        setVersion(json.leaderboardVersion || 0);
      }
    } catch {} finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const handleReconcile = async () => {
    try {
      setStatusMessage('Reconciling leaderboard state across PostgreSQL authoritative ledger...');
      const res = await fetch('/api/v1/admin/leaderboard/reconcile', {
        method: 'POST',
        headers: {
          'x-csrf-token': csrfToken || '',
        },
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMessage('✓ Leaderboard reconciled and broadcasted successfully.');
        setEntries(data.snapshot?.entries || []);
        setVersion(data.snapshot?.leaderboardVersion || 0);
      } else {
        setStatusMessage(`Error: ${data.message}`);
      }
    } catch (err: any) {
      setStatusMessage(`Reconciliation error: ${err.message}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', textTransform: 'uppercase' }}>
            AUTHORITATIVE LEADERBOARD SNAPSHOT
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
            PostgreSQL state of record rankings with monotonic deterministic tie-breaker resolution.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleReconcile} className="btn btn-cyan">
            FORCE RECONCILIATION
          </button>
          <button onClick={() => fetchLeaderboard()} className="btn btn-secondary">
            REFRESH SNAPSHOT
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '3px',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            background: 'rgba(0, 212, 255, 0.1)',
            border: '1px solid var(--accent-cyan)',
            color: 'var(--accent-cyan)',
          }}
        >
          {statusMessage}
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <span className="card-title">TOURNAMENT STANDINGS</span>
          <span className="badge badge-cyan">VERSION: {version}</span>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>RANK</th>
                <th>TEAM NAME</th>
                <th>TOTAL SCORE</th>
                <th>LAST SCORE EVENT</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.teamId}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '14px' }}>
                    #{entry.rank}
                  </td>
                  <td style={{ fontWeight: 600, fontSize: '13px' }}>{entry.teamName}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                    {entry.score} PTS
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
                    {entry.lastScoreAt ? new Date(entry.lastScoreAt).toLocaleString() : '-'}
                  </td>
                  <td>
                    <span className="badge badge-green">ACTIVE</span>
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                    Leaderboard currently has zero scored teams.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
