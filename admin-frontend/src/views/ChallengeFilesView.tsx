import React, { useEffect, useState } from 'react';
import { Challenge } from '../types';

export const ChallengeFilesView: React.FC = () => {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [selectedChallengeId, setSelectedChallengeId] = useState<string>('');
  const [files, setFiles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/admin/challenges')
      .then((res) => res.json())
      .then((data) => {
        setChallenges(data);
        if (data.length > 0) setSelectedChallengeId(data[0].id);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const selectedChal = challenges.find((c) => c.id === selectedChallengeId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', textTransform: 'uppercase' }}>
          CHALLENGE ARTIFACT & FILE MANAGEMENT
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
          Inspect protected challenge attachments served strictly via authenticated X-Accel-Redirect paths.
        </p>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">SELECT TARGET CHALLENGE</span>
        </div>
        <select
          value={selectedChallengeId}
          onChange={(e) => setSelectedChallengeId(e.target.value)}
          style={{ maxWidth: '400px', fontFamily: 'var(--font-mono)' }}
        >
          {challenges.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} ({c.slug}) — {c.points} PTS
            </option>
          ))}
        </select>
      </div>

      {selectedChal && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">PROTECTED ATTACHMENTS — {selectedChal.title}</span>
            <span className="badge badge-cyan">X-ACCEL PROTECTED</span>
          </div>

          <div style={{ padding: '8px 0' }}>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              All challenge attachments reside in the private volume <code>/data/challenges/static/</code> and are only served via session-verified internal proxy redirection.
            </p>

            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>CHALLENGE</th>
                    <th>SLUG</th>
                    <th>DIFFICULTY</th>
                    <th>AUTHOR</th>
                    <th>STORAGE STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ fontWeight: 600 }}>{selectedChal.title}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{selectedChal.slug}</td>
                    <td>
                      <span className="badge badge-green">{selectedChal.difficulty}</span>
                    </td>
                    <td>{selectedChal.author}</td>
                    <td>
                      <span className="badge badge-cyan">PROTECTED INTERNAL STORAGE</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
