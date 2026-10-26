import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export const LoginView: React.FC = () => {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError('Please provide administrative identifier and password.');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    const result = await login(identifier.trim(), password);
    setIsSubmitting(false);

    if (!result.success) {
      setError(result.error || 'Authentication rejected by security policy.');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at center, #0f1826 0%, #06090e 100%)',
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          background: '#0d131d',
          border: '1px solid #1e2c40',
          borderRadius: '4px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
          overflow: 'hidden',
        }}
      >
        {/* Header Banner */}
        <div
          style={{
            padding: '24px 24px 16px 24px',
            borderBottom: '1px solid #1e2c40',
            background: '#080c12',
          }}
        >
          <div
            style={{
              display: 'inline-block',
              background: 'rgba(0, 212, 255, 0.1)',
              border: '1px solid var(--accent-cyan)',
              padding: '3px 8px',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '1px',
              color: 'var(--accent-cyan)',
              marginBottom: '8px',
            }}
          >
            TECHX CTF 2026
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '15px',
              fontWeight: 700,
              letterSpacing: '1px',
              color: 'var(--text-primary)',
              textTransform: 'uppercase',
            }}
          >
            ADMIN CONTROL CENTER
          </h1>
          <p
            style={{
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
              marginTop: '4px',
            }}
          >
            OPERATIONS DESK — AUTHORIZED PERSONNEL ONLY
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
          <div style={{ marginBottom: '14px', fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>
            ADMIN AUTHENTICATION
          </div>

          {error && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '3px',
                padding: '10px 12px',
                fontSize: '12px',
                color: '#f87171',
                marginBottom: '16px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {error}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Email or Username</label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="admin@techxmadras.org"
              required
              autoFocus
              disabled={isSubmitting}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '22px' }}>
            <label className="form-label">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              disabled={isSubmitting}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{
              width: '100%',
              padding: '10px',
              fontSize: '12px',
              letterSpacing: '1px',
            }}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'AUTHENTICATING...' : 'SIGN IN'}
          </button>
        </form>

        {/* Footer Security Notice */}
        <div
          style={{
            background: '#070a0f',
            borderTop: '1px solid #141e2e',
            padding: '10px 24px',
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-muted)',
            textAlign: 'center',
          }}
        >
          SESSION ACCESS MONITORED & AUDITED UNDER SEC-OPS PROTOCOL
        </div>
      </div>
    </div>
  );
};
