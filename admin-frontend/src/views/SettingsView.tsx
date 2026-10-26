import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export const SettingsView: React.FC = () => {
  const { user, changePassword } = useAuth();

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    if (newPassword.length < 10) {
      setStatusMessage('Error: New password must be at least 10 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setStatusMessage('Error: New password and confirmation do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await changePassword(currentPassword, newPassword);
      if (res.success) {
        setStatusMessage('✓ Admin credentials updated successfully. New password is now active.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setStatusMessage(`Error: ${res.error || 'Failed to update credentials'}`);
      }
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', textTransform: 'uppercase' }}>
          ADMINISTRATOR SETTINGS & CREDENTIAL SECURITY
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
          Manage your operations session identity, update authentication keys, and inspect environment parameters.
        </p>
      </div>

      {statusMessage && (
        <div
          style={{
            padding: '10px 14px',
            background: statusMessage.startsWith('✓') ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            borderLeft: `3px solid ${statusMessage.startsWith('✓') ? 'var(--status-green)' : 'var(--status-red)'}`,
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
          }}
        >
          {statusMessage}
        </div>
      )}

      {/* Operator Identity Panel */}
      <div className="card">
        <h3 style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: '14px', color: 'var(--accent-cyan)' }}>
          ACTIVE OPERATOR IDENTITY
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
          <div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>USERNAME</span>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{user?.username}</div>
          </div>
          <div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>EMAIL ADDRESS</span>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{user?.email}</div>
          </div>
          <div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>RBAC PRIVILEGE ROLE</span>
            <div>
              <span
                className="badge"
                style={{
                  background: 'rgba(6, 182, 212, 0.15)',
                  color: 'var(--accent-cyan)',
                  border: '1px solid rgba(6, 182, 212, 0.4)',
                  fontSize: '11px',
                }}
              >
                {user?.role?.toUpperCase()}
              </span>
            </div>
          </div>
          <div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>OPERATOR USER ID</span>
            <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
              {user?.id}
            </div>
          </div>
        </div>
      </div>

      {/* Change Password Panel */}
      <div className="card" style={{ maxWidth: '600px' }}>
        <h3 style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: '14px', color: 'var(--status-green)' }}>
          [SECURITY] ROTATE OPERATOR PASSWORD
        </h3>
        <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label className="form-label">Current Operator Password</label>
            <input
              type="password"
              placeholder="••••••••••••"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="form-label">New Master Password (Min 10 Characters)</label>
            <input
              type="password"
              placeholder="••••••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="form-label">Confirm New Master Password</label>
            <input
              type="password"
              placeholder="••••••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
              style={{ minWidth: '160px' }}
            >
              {isSubmitting ? 'Updating Credentials...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>

      {/* Network & Environment Parameters */}
      <div className="card">
        <h3 style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: '14px' }}>
          NETWORK & SYSTEM TOPOLOGY
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
          <div style={{ background: '#070b12', padding: '12px', border: '1px solid #1e2c40' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>ADMIN PORTAL LISTENER</span>
            <div style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>
              PORT 8080 (Dedicated NGINX Reverse Proxy)
            </div>
          </div>
          <div style={{ background: '#070b12', padding: '12px', border: '1px solid #1e2c40' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>PARTICIPANT PLATFORM</span>
            <div style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: 'var(--status-green)' }}>
              PORT 80 (Standard Participant Web Client)
            </div>
          </div>
          <div style={{ background: '#070b12', padding: '12px', border: '1px solid #1e2c40' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>CHALLENGE GATEWAY</span>
            <div style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: 'var(--status-amber)' }}>
              PORT 5000 (Internal Bridge)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
