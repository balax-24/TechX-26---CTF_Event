import React, { useEffect, useState } from 'react';
import { Hint } from '../types';
import { useAuth } from '../context/AuthContext';
import { ConfirmModal } from '../components/ConfirmModal';

export const HintsView: React.FC = () => {
  const { csrfToken } = useAuth();
  const [hints, setHints] = useState<Hint[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  // Edit Hint Modal
  const [editModal, setEditModal] = useState<{
    isOpen: boolean;
    hint: Hint | null;
    content: string;
    penaltyPoints: number;
    orderNumber: number;
  }>({
    isOpen: false,
    hint: null,
    content: '',
    penaltyPoints: 0,
    orderNumber: 1,
  });

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    action: async () => {},
  });

  const fetchHints = async () => {
    try {
      const res = await fetch('/api/v1/admin/hints');
      if (res.ok) {
        const json = await res.json();
        setHints(json);
      }
    } catch {} finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHints();
  }, []);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal.hint) return;
    try {
      const res = await fetch(`/api/v1/admin/hints/${editModal.hint.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken || '',
        },
        body: JSON.stringify({
          content: editModal.content,
          penaltyPoints: editModal.penaltyPoints,
          orderNumber: editModal.orderNumber,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.message || 'Hint update failed', isError: true });
      } else {
        setMessage({ text: 'Hint configuration updated successfully' });
        setEditModal({ isOpen: false, hint: null, content: '', penaltyPoints: 0, orderNumber: 1 });
        fetchHints();
      }
    } catch (err: any) {
      setMessage({ text: err.message, isError: true });
    }
  };

  const handleDelete = async (hintId: string) => {
    try {
      const res = await fetch(`/api/v1/admin/hints/${hintId}`, {
        method: 'DELETE',
        headers: {
          'x-csrf-token': csrfToken || '',
        },
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.message || 'Hint deletion failed', isError: true });
      } else {
        setMessage({ text: 'Hint removed' });
        fetchHints();
      }
    } catch (err: any) {
      setMessage({ text: err.message, isError: true });
    }
  };

  const filtered = hints.filter(
    (h) =>
      h.challengeTitle.toLowerCase().includes(search.toLowerCase()) ||
      h.content.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', textTransform: 'uppercase' }}>
            HINT SYSTEM & PENALTY CONTROLS
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
            Progressive hint configurations, point penalty deductions, and team unlock monitoring.
          </p>
        </div>
        <button onClick={() => fetchHints()} className="btn btn-secondary">
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

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Filter by challenge or hint text..."
        style={{ maxWidth: '360px', fontFamily: 'var(--font-mono)' }}
      />

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>CHALLENGE</th>
              <th>TIER #</th>
              <th>CONTENT</th>
              <th>PENALTY</th>
              <th>TIMES UNLOCKED</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((h) => (
              <tr key={h.id}>
                <td style={{ fontWeight: 600 }}>{h.challengeTitle}</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>Tier {h.orderNumber}</td>
                <td style={{ maxWidth: '350px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {h.content}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--status-amber)' }}>
                  -{h.penaltyPoints} PTS
                </td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>
                  <span className="badge badge-gray">{h.unlockedCount} teams</span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '3px 7px', fontSize: '10px' }}
                      onClick={() =>
                        setEditModal({
                          isOpen: true,
                          hint: h,
                          content: h.content,
                          penaltyPoints: h.penaltyPoints,
                          orderNumber: h.orderNumber,
                        })
                      }
                    >
                      EDIT
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '3px 7px', fontSize: '10px', color: '#f87171' }}
                      onClick={() =>
                        setConfirmModal({
                          isOpen: true,
                          title: 'DELETE HINT',
                          message: `Are you sure you want to delete Hint #${h.orderNumber} for "${h.challengeTitle}"?`,
                          action: () => handleDelete(h.id),
                        })
                      }
                    >
                      DELETE
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                  No hints found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editModal.isOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', marginBottom: '12px' }}>
              EDIT HINT — {editModal.hint?.challengeTitle}
            </h3>
            <form onSubmit={handleUpdate}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div className="form-group">
                  <label className="form-label">Tier / Order #</label>
                  <input
                    type="number"
                    value={editModal.orderNumber}
                    onChange={(e) =>
                      setEditModal({ ...editModal, orderNumber: parseInt(e.target.value, 10) || 1 })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Penalty Points</label>
                  <input
                    type="number"
                    value={editModal.penaltyPoints}
                    onChange={(e) =>
                      setEditModal({ ...editModal, penaltyPoints: parseInt(e.target.value, 10) || 0 })
                    }
                    required
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '18px' }}>
                <label className="form-label">Hint Guidance Content</label>
                <textarea
                  rows={4}
                  value={editModal.content}
                  onChange={(e) => setEditModal({ ...editModal, content: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditModal({ isOpen: false, hint: null, content: '', penaltyPoints: 0, orderNumber: 1 })}
                >
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
