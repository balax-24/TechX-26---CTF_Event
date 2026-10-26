import React, { useEffect, useState } from 'react';
import { Checkpoint } from '../types';
import { useAuth } from '../context/AuthContext';

export const CheckpointsView: React.FC = () => {
  const { csrfToken } = useAuth();
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const fetchCheckpoints = async () => {
    try {
      const res = await fetch('/api/v1/admin/checkpoints');
      if (res.ok) {
        const json = await res.json();
        setCheckpoints(json);
      }
    } catch {} finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCheckpoints();
  }, []);

  const filtered = checkpoints.filter(
    (cp) =>
      cp.title.toLowerCase().includes(search.toLowerCase()) ||
      cp.challengeTitle.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', textTransform: 'uppercase' }}>
            CHECKPOINT ARCHITECTURE & COMPLETION AUDIT
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
            Multi-stage progressive challenge steps, token proof verification methods, and team completion counts.
          </p>
        </div>
        <button onClick={() => fetchCheckpoints()} className="btn btn-secondary">
          REFRESH
        </button>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Filter by challenge or step title..."
        style={{ maxWidth: '360px', fontFamily: 'var(--font-mono)' }}
      />

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>CHALLENGE</th>
              <th>STEP #</th>
              <th>STEP TITLE</th>
              <th>POINT VALUE</th>
              <th>PROOF TYPE</th>
              <th>COMPLETED TEAMS</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((cp) => (
              <tr key={cp.id}>
                <td style={{ fontWeight: 600 }}>{cp.challengeTitle}</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>#{cp.stepNumber}</td>
                <td>{cp.title}</td>
                <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>
                  +{cp.pointValue} PTS
                </td>
                <td>
                  <span className="badge badge-gray">{cp.validationType}</span>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--status-green)' }}>
                  {cp.completionCount} solves
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                  No checkpoints registered.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
