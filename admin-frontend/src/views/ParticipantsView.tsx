import React, { useEffect, useState } from 'react';
import { Participant } from '../types';
import { ConfirmModal } from '../components/ConfirmModal';
import { useAuth } from '../context/AuthContext';

export const ParticipantsView: React.FC = () => {
  const { csrfToken } = useAuth();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newParticipant, setNewParticipant] = useState({ username: '', email: '', password: '', teamId: '' });
  const [resetPwdModal, setResetPwdModal] = useState<{ isOpen: boolean; user: Participant | null; newPassword: '' }>({
    isOpen: false,
    user: null,
    newPassword: '',
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

  const fetchParticipants = async () => {
    try {
      const res = await fetch('/api/v1/admin/users');
      if (res.ok) {
        const json = await res.json();
        setParticipants(json);
      }
    } catch {} finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchParticipants();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newParticipant.username || !newParticipant.email || !newParticipant.password) return;
    try {
      const res = await fetch('/api/v1/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken || '',
        },
        body: JSON.stringify(newParticipant),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.message || 'Creation failed', isError: true });
      } else {
        setMessage({ text: `Participant ${newParticipant.username} created successfully` });
        setCreateModalOpen(false);
        setNewParticipant({ username: '', email: '', password: '', teamId: '' });
        fetchParticipants();
      }
    } catch (err: any) {
      setMessage({ text: err.message, isError: true });
    }
  };

  const handleResetPassword = async () => {
    if (!resetPwdModal.user || !resetPwdModal.newPassword) return;
    try {
      const res = await fetch(`/api/v1/admin/users/${resetPwdModal.user.id}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken || '',
        },
        body: JSON.stringify({ password: resetPwdModal.newPassword, reason: 'Admin manual reset' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.message || 'Password reset failed', isError: true });
      } else {
        setMessage({ text: `Password reset successfully for ${resetPwdModal.user.username}` });
        setResetPwdModal({ isOpen: false, user: null, newPassword: '' });
      }
    } catch (err: any) {
      setMessage({ text: err.message, isError: true });
    }
  };

  const toggleUserActive = async (userId: string, targetActive: boolean) => {
    try {
      const endpoint = targetActive ? 'enable' : 'disable';
      const res = await fetch(`/api/v1/admin/users/${userId}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken || '',
        },
        body: JSON.stringify({ reason: `Admin ${endpoint}d participant` }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.message || 'Operation failed', isError: true });
      } else {
        setMessage({ text: `Participant ${targetActive ? 'enabled' : 'disabled'}` });
        fetchParticipants();
      }
    } catch (err: any) {
      setMessage({ text: err.message, isError: true });
    }
  };

  const filtered = participants.filter(
    (p) =>
      p.username.toLowerCase().includes(search.toLowerCase()) ||
      p.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', textTransform: 'uppercase' }}>
            PARTICIPANT / USER CONTROL
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
            User account lifecycle, password resets, access revocation, and team assignment oversight.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setCreateModalOpen(true)} className="btn btn-primary">
            + CREATE PARTICIPANT
          </button>
          <button onClick={() => fetchParticipants()} className="btn btn-secondary">
            REFRESH
          </button>
        </div>
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

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Filter by username or email..."
        style={{ maxWidth: '360px', fontFamily: 'var(--font-mono)' }}
      />

      {/* Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>USERNAME</th>
              <th>EMAIL</th>
              <th>ROLE</th>
              <th>STATUS</th>
              <th>REGISTERED</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id}>
                <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{p.username}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{p.email}</td>
                <td>
                  <span
                    className={`badge ${
                      p.role === 'superadmin' ? 'badge-cyan' : p.role === 'admin' ? 'badge-blue' : 'badge-gray'
                    }`}
                  >
                    {p.role}
                  </span>
                </td>
                <td>
                  <span className={`badge ${p.isActive ? 'badge-green' : 'badge-red'}`}>
                    {p.isActive ? 'ACTIVE' : 'DISABLED'}
                  </span>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
                  {new Date(p.createdAt).toLocaleDateString()}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '3px 7px', fontSize: '10px' }}
                      onClick={() => setResetPwdModal({ isOpen: true, user: p, newPassword: '' })}
                    >
                      RESET PWD
                    </button>
                    {p.isActive ? (
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '3px 7px', fontSize: '10px', color: '#f87171' }}
                        onClick={() =>
                          setConfirmModal({
                            isOpen: true,
                            title: 'DISABLE USER',
                            message: `Disable participant "${p.username}"? They will be locked out immediately.`,
                            action: () => toggleUserActive(p.id, false),
                          })
                        }
                      >
                        DISABLE
                      </button>
                    ) : (
                      <button
                        className="btn btn-success"
                        style={{ padding: '3px 7px', fontSize: '10px' }}
                        onClick={() => toggleUserActive(p.id, true)}
                      >
                        ENABLE
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                  No participants found matching filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create Participant Modal */}
      {createModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '440px' }}>
            <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', marginBottom: '12px' }}>
              PROVISION NEW PARTICIPANT
            </h3>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Username</label>
                <input
                  type="text"
                  value={newParticipant.username}
                  onChange={(e) => setNewParticipant({ ...newParticipant, username: e.target.value })}
                  required
                  placeholder="e.g. cyber_operative"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  value={newParticipant.email}
                  onChange={(e) => setNewParticipant({ ...newParticipant, email: e.target.value })}
                  required
                  placeholder="e.g. op@college.edu"
                />
              </div>
              <div className="form-group" style={{ marginBottom: '18px' }}>
                <label className="form-label">Initial Password (min 8 chars)</label>
                <input
                  type="password"
                  value={newParticipant.password}
                  onChange={(e) => setNewParticipant({ ...newParticipant, password: e.target.value })}
                  required
                  placeholder="••••••••••••"
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setCreateModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Provision User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetPwdModal.isOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', marginBottom: '12px' }}>
              RESET PASSWORD — {resetPwdModal.user?.username}
            </h3>
            <div className="form-group" style={{ marginBottom: '18px' }}>
              <label className="form-label">New Password (min 8 chars)</label>
              <input
                type="password"
                value={resetPwdModal.newPassword}
                onChange={(e) => setResetPwdModal({ ...resetPwdModal, newPassword: e.target.value as any })}
                required
                autoFocus
                placeholder="Enter new password"
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setResetPwdModal({ isOpen: false, user: null, newPassword: '' })}
              >
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={handleResetPassword}>
                Commit Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        requiredPhrase={confirmModal.requiredPhrase}
        onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        onConfirm={async () => {
          setConfirmModal({ ...confirmModal, isOpen: false });
          await confirmModal.action();
        }}
      />
    </div>
  );
};
