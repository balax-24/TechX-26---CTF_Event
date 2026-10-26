import React, { useEffect, useState } from 'react';
import { Challenge } from '../types';
import { ConfirmModal } from '../components/ConfirmModal';
import { useAuth } from '../context/AuthContext';

export const ChallengesView: React.FC = () => {
  const { csrfToken } = useAuth();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [search, setSearch] = useState('');
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  // Edit form state
  const [editForm, setEditForm] = useState<{
    title: string;
    points: number;
    difficulty: string;
    status: string;
    description: string;
    connectionInfo: string;
  }>({
    title: '',
    points: 100,
    difficulty: 'beginner',
    status: 'draft',
    description: '',
    connectionInfo: '',
  });

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    requiredPhrase?: string;
    action: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    action: async () => {},
  });

  const fetchChallenges = async () => {
    try {
      const res = await fetch('/api/v1/admin/challenges');
      if (res.ok) {
        const json = await res.json();
        setChallenges(json);
      }
    } catch {} finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchChallenges();
  }, []);

  const openEditor = (chal: Challenge) => {
    setSelectedChallenge(chal);
    setEditForm({
      title: chal.title,
      points: chal.points,
      difficulty: chal.difficulty,
      status: chal.status,
      description: chal.description,
      connectionInfo: chal.connectionInfo || '',
    });
    setIsEditing(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChallenge) return;
    try {
      const res = await fetch(`/api/v1/admin/challenges/${selectedChallenge.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken || '',
        },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.message || 'Update failed', isError: true });
      } else {
        setMessage({ text: `Challenge "${editForm.title}" updated successfully.` });
        setIsEditing(false);
        fetchChallenges();
      }
    } catch (err: any) {
      setMessage({ text: err.message, isError: true });
    }
  };

  const setStatus = async (chalId: string, status: string) => {
    try {
      const res = await fetch(`/api/v1/admin/challenges/${chalId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken || '',
        },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.message || 'Status update failed', isError: true });
      } else {
        setMessage({ text: `Challenge status set to ${status}` });
        fetchChallenges();
      }
    } catch (err: any) {
      setMessage({ text: err.message, isError: true });
    }
  };

  const filtered = challenges.filter(
    (c) =>
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', textTransform: 'uppercase' }}>
            CHALLENGE CONTROL & CONTENT
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
            Manage challenge parameters, points, releases, visibility, and connection information.
          </p>
        </div>
        <button onClick={() => fetchChallenges()} className="btn btn-secondary">
          REFRESH
        </button>
      </div>

      {message && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '3px',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            background: message.isError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
            border: `1px solid ${message.isError ? 'var(--status-red)' : 'var(--status-green)'}`,
            color: message.isError ? '#f87171' : 'var(--status-green)',
          }}
        >
          {message.text}
        </div>
      )}

      {/* Filter and Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Filter by challenge title or slug..."
        style={{ maxWidth: '360px', fontFamily: 'var(--font-mono)' }}
      />

      {/* Challenges Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>CHALLENGE</th>
              <th>SLUG</th>
              <th>DIFFICULTY</th>
              <th>POINTS</th>
              <th>STATUS</th>
              <th>SOLVES</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>{c.title}</td>
                <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '11px' }}>
                  {c.slug}
                </td>
                <td>
                  <span
                    className={`badge ${
                      c.difficulty === 'beginner'
                        ? 'badge-green'
                        : c.difficulty === 'intermediate'
                        ? 'badge-amber'
                        : 'badge-red'
                    }`}
                  >
                    {c.difficulty}
                  </span>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--accent-cyan)' }}>
                  {c.points} PTS
                </td>
                <td>
                  <span
                    className={`badge ${
                      c.status === 'published' ? 'badge-green' : c.status === 'draft' ? 'badge-gray' : 'badge-amber'
                    }`}
                  >
                    {c.status}
                  </span>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{c.solveCount}</td>
                <td>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '3px 7px', fontSize: '10px' }}
                      onClick={() => openEditor(c)}
                    >
                      EDIT
                    </button>
                    {c.status === 'published' ? (
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '3px 7px', fontSize: '10px', color: '#f87171' }}
                        onClick={() =>
                          setConfirmModal({
                            isOpen: true,
                            title: 'UNPUBLISH CHALLENGE',
                            message: `Unpublish "${c.title}"? Participants will no longer be able to view or solve this challenge.`,
                            action: () => setStatus(c.id, 'draft'),
                          })
                        }
                      >
                        UNPUBLISH
                      </button>
                    ) : (
                      <button
                        className="btn btn-success"
                        style={{ padding: '3px 7px', fontSize: '10px' }}
                        onClick={() => setStatus(c.id, 'published')}
                      >
                        PUBLISH
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                  No challenges found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Challenge Modal */}
      {isEditing && selectedChallenge && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '580px' }}>
            <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', marginBottom: '14px' }}>
              EDIT CHALLENGE — {selectedChallenge.slug}
            </h3>
            <form onSubmit={handleUpdate}>
              <div className="form-group">
                <label className="form-label">Title</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div className="form-group">
                  <label className="form-label">Points</label>
                  <input
                    type="number"
                    value={editForm.points}
                    onChange={(e) => setEditForm({ ...editForm, points: parseInt(e.target.value, 10) || 0 })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Difficulty</label>
                  <select
                    value={editForm.difficulty}
                    onChange={(e) => setEditForm({ ...editForm, difficulty: e.target.value })}
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="expert">Expert</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  >
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                    <option value="hidden">Hidden</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Connection Info (Host / Port / Instructions)</label>
                <input
                  type="text"
                  value={editForm.connectionInfo}
                  onChange={(e) => setEditForm({ ...editForm, connectionInfo: e.target.value })}
                  placeholder="e.g. nc 10.0.0.1 1337 or http://chal.domain/"
                />
              </div>

              <div className="form-group" style={{ marginBottom: '18px' }}>
                <label className="form-label">Description / Briefing</label>
                <textarea
                  rows={4}
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsEditing(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        onConfirm={async () => {
          setConfirmModal({ ...confirmModal, isOpen: false });
          await confirmModal.action();
        }}
      />
    </div>
  );
};
