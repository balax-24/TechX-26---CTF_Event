import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export const ForcePasswordChangeModal: React.FC = () => {
  const { changePassword, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentPassword) {
      setError('Please provide current password.');
      return;
    }

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    if (currentPassword === newPassword) {
      setError('New password must be different from current temporary password.');
      return;
    }

    setIsSubmitting(true);
    const result = await changePassword(currentPassword, newPassword);
    setIsSubmitting(false);

    if (!result.success) {
      setError(result.error || 'Failed to update administrator password.');
    } else {
      setSuccess(true);
      // Require fresh login with new password per prompt specification
      setTimeout(async () => {
        await logout();
      }, 1800);
    }
  };

  return (
    <div className="modal-overlay" style={{ backdropFilter: 'blur(5px)' }}>
      <div className="modal-content" style={{ maxWidth: '440px' }}>
        <div
          style={{
            borderBottom: '1px solid var(--border-dim)',
            paddingBottom: '12px',
            marginBottom: '16px',
          }}
        >
          <div
            style={{
              display: 'inline-block',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid var(--status-red)',
              padding: '2px 8px',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              fontWeight: 700,
              color: '#f87171',
              marginBottom: '8px',
            }}
          >
            TEMPORARY ADMIN PASSWORD DETECTED
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '14px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              textTransform: 'uppercase',
            }}
          >
            FORCE PASSWORD CHANGE
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            The bootstrap administrator credential was designed exclusively for initial setup. You must establish a secure permanent password before continuing to operations.
          </p>
        </div>

        {error && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '3px',
              padding: '8px 12px',
              fontSize: '12px',
              color: '#f87171',
              marginBottom: '14px',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {error}
          </div>
        )}

        {success ? (
          <div
            style={{
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              borderRadius: '3px',
              padding: '14px',
              textAlign: 'center',
              fontFamily: 'var(--font-mono)',
              color: 'var(--status-green)',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: '6px' }}>✓ PASSWORD CHANGED SUCCESSFULLY</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              Invalidating temporary session and redirecting to sign-in with your new password...
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoFocus
                placeholder="Current temporary password"
              />
            </div>

            <div className="form-group">
              <label className="form-label">New Password (min 8 chars)</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                placeholder="New strong administrative password"
              />
            </div>

            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Confirm new password"
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => logout()}
                disabled={isSubmitting}
              >
                Sign Out
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'UPDATING...' : 'CHANGE PASSWORD & RE-LOGIN'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
