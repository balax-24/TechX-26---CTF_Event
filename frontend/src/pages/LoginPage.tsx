import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/common/Button';

export const LoginPage: React.FC = () => {
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as any)?.from?.pathname || '/dashboard';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailOrUsername || !password) {
      setError('Please provide your username/email and password.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await login({ emailOrUsername: emailOrUsername.trim(), password });
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify credentials or contact an administrator.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        minHeight: 'calc(100vh - var(--nav-height, 60px) - 100px)',
        padding: '32px 16px',
        backgroundColor: 'var(--color-bg, #0B0D13)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          backgroundColor: 'var(--color-surface, #11141D)',
          border: '1px solid var(--color-border, #1E2335)',
          borderRadius: 'var(--radius-sm, 2px)',
          padding: '32px 28px',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        {/* Header with Official Logo */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <img
            src="/TechX White New.png"
            alt="TechX Madras 2026"
            style={{
              height: '42px',
              width: 'auto',
              maxHeight: '42px',
              objectFit: 'contain',
              margin: '0 auto 16px auto',
              display: 'block',
            }}
          />
          <h1
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm, 0.875rem)',
              letterSpacing: '0.12em',
              fontWeight: 700,
              color: 'var(--color-text, #F8FAFC)',
              textTransform: 'uppercase',
              marginBottom: '4px',
            }}
          >
            TECHX MADRAS 2026
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs, 0.75rem)',
              letterSpacing: '0.08em',
              color: 'var(--color-brand-bright, #BA68C8)',
              fontWeight: 600,
              textTransform: 'uppercase',
            }}
          >
            CTF COMPETITION PLATFORM
          </p>
        </div>

        {/* Divider */}
        <div
          style={{
            height: '1px',
            backgroundColor: 'var(--color-border, #1E2335)',
            marginBottom: '24px',
          }}
        />

        {error && (
          <div
            role="alert"
            style={{
              padding: '10px 14px',
              backgroundColor: 'var(--color-danger-bg, rgba(239, 68, 68, 0.1))',
              border: '1px solid var(--color-danger-border, rgba(239, 68, 68, 0.25))',
              borderRadius: 'var(--radius-sm, 2px)',
              color: 'var(--color-danger, #EF4444)',
              fontSize: 'var(--text-xs, 0.75rem)',
              fontFamily: 'var(--font-mono)',
              marginBottom: '20px',
              lineHeight: 1.4,
            }}
          >
            [AUTH_ERROR]: {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div>
            <label
              htmlFor="username-input"
              style={{
                display: 'block',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
                letterSpacing: '0.08em',
                fontWeight: 700,
                color: 'var(--color-text-secondary, #94A3B8)',
                marginBottom: '6px',
                textTransform: 'uppercase',
              }}
            >
              TEAM / USERNAME / EMAIL
            </label>
            <input
              id="username-input"
              type="text"
              placeholder="e.g. cyber_warriors or user@example.com"
              value={emailOrUsername}
              onChange={(e) => setEmailOrUsername(e.target.value)}
              disabled={isSubmitting}
              required
              autoFocus
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm, 0.875rem)',
                padding: '10px 12px',
                backgroundColor: 'var(--color-surface-sunken, #07080C)',
                border: '1px solid var(--color-border, #1E2335)',
                borderRadius: 'var(--radius-sm, 2px)',
                color: '#FFFFFF',
                width: '100%',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="password-input"
              style={{
                display: 'block',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
                letterSpacing: '0.08em',
                fontWeight: 700,
                color: 'var(--color-text-secondary, #94A3B8)',
                marginBottom: '6px',
                textTransform: 'uppercase',
              }}
            >
              PASSWORD
            </label>
            <input
              id="password-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
              required
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm, 0.875rem)',
                padding: '10px 12px',
                backgroundColor: 'var(--color-surface-sunken, #07080C)',
                border: '1px solid var(--color-border, #1E2335)',
                borderRadius: 'var(--radius-sm, 2px)',
                color: '#FFFFFF',
                width: '100%',
                outline: 'none',
              }}
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isSubmitting}
            style={{
              width: '100%',
              marginTop: '6px',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs, 0.75rem)',
              letterSpacing: '0.1em',
              padding: '12px',
            }}
          >
            SIGN IN
          </Button>
        </form>

        {/* Divider */}
        <div
          style={{
            height: '1px',
            backgroundColor: 'var(--color-border, #1E2335)',
            marginTop: '24px',
            marginBottom: '16px',
          }}
        />

        {/* Security Notice */}
        <div style={{ textAlign: 'center' }}>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.7rem',
              letterSpacing: '0.05em',
              color: 'var(--color-text-muted, #64748B)',
            }}
          >
            Authorized participants only. Accounts are provisioned by tournament administrators.
          </p>
        </div>
      </div>
    </div>
  );
};
