import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../common/Button';

export const Navbar: React.FC = () => {
  const { user, team, isAuthenticated, logout, isAdmin } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  const navLinks = isAuthenticated
    ? [
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Challenges', path: '/challenges' },
        { label: 'Leaderboard', path: '/leaderboard' },
        { label: 'Team', path: '/team' },
      ]
    : [
        { label: 'Home', path: '/' },
        { label: 'Leaderboard', path: '/leaderboard' },
      ];

  return (
    <header
      style={{
        height: 'var(--nav-height, 64px)',
        backgroundColor: 'var(--color-surface, #161926)',
        borderBottom: '1px solid var(--color-border, #262B3F)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <div
        className="container"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Brand Logo */}
        <Link
          to={isAuthenticated ? '/dashboard' : '/'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            textDecoration: 'none',
          }}
        >
          <div
            style={{
              width: '32px',
              height: '32px',
              backgroundColor: 'var(--color-brand, #6A1B9A)',
              borderRadius: 'var(--radius-md, 8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              fontWeight: 800,
              fontSize: '1rem',
              boxShadow: 'var(--shadow-glow, 0 0 10px rgba(106, 27, 154, 0.4))',
            }}
          >
            TX
          </div>
          <div>
            <span
              style={{
                fontWeight: 800,
                fontSize: '1rem',
                letterSpacing: '0.05em',
                color: 'var(--color-text, #F8FAFC)',
              }}
            >
              TECHX
            </span>
            <span
              style={{
                fontSize: '0.75rem',
                color: 'var(--color-brand-bright, #BA68C8)',
                marginLeft: '6px',
                fontWeight: 600,
              }}
            >
              2026
            </span>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav
          style={{
            display: 'none',
            alignItems: 'center',
            gap: '24px',
          }}
          className="desktop-nav"
        >
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              style={{
                fontSize: 'var(--text-sm, 0.875rem)',
                fontWeight: 600,
                color: isActive(link.path)
                  ? 'var(--color-brand-bright, #BA68C8)'
                  : 'var(--color-text-secondary, #94A3B8)',
                padding: '8px 4px',
                borderBottom: isActive(link.path)
                  ? '2px solid var(--color-brand-light, #8E24AA)'
                  : '2px solid transparent',
                transition: 'color var(--transition-fast)',
              }}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* User Status / Action Buttons */}
        <div
          style={{
            display: 'none',
            alignItems: 'center',
            gap: '16px',
          }}
          className="desktop-actions"
        >
          {isAuthenticated ? (
            <>
              {team && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    backgroundColor: 'var(--color-surface-sunken, #090B10)',
                    padding: '4px 12px',
                    borderRadius: 'var(--radius-full, 9999px)',
                    border: '1px solid var(--color-border, #262B3F)',
                    fontSize: 'var(--text-xs, 0.75rem)',
                  }}
                >
                  <span style={{ color: 'var(--color-text-muted, #64748B)' }}>TEAM:</span>
                  <span style={{ fontWeight: 700, color: 'var(--color-text, #F8FAFC)' }}>
                    {team.name}
                  </span>
                  <span
                    style={{
                      backgroundColor: 'var(--color-brand-muted, rgba(106, 27, 154, 0.2))',
                      color: 'var(--color-brand-bright, #BA68C8)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontWeight: 700,
                    }}
                  >
                    {team.score} pts
                  </span>
                </div>
              )}

              {isAdmin && (
                <span
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                    color: '#EF4444',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                  }}
                  title="Administrative accounts cannot participate in CTF submissions"
                >
                  ADMIN
                </span>
              )}

              <span
                style={{
                  fontSize: 'var(--text-sm, 0.875rem)',
                  color: 'var(--color-text-secondary, #94A3B8)',
                }}
              >
                {user?.username}
              </span>

              <Button variant="ghost" size="sm" onClick={() => logout()}>
                Logout
              </Button>
            </>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost" size="sm">
                  Sign In
                </Button>
              </Link>
              <Link to="/register">
                <Button variant="primary" size="sm">
                  Register
                </Button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile Hamburger Button */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--color-text, #F8FAFC)',
            fontSize: '1.5rem',
            cursor: 'pointer',
            padding: '8px',
            display: 'block',
          }}
          className="mobile-toggle"
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'var(--nav-height, 64px)',
            left: 0,
            right: 0,
            backgroundColor: 'var(--color-surface, #161926)',
            borderBottom: '1px solid var(--color-border, #262B3F)',
            padding: '16px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              onClick={() => setMobileMenuOpen(false)}
              style={{
                fontSize: '1rem',
                fontWeight: 600,
                color: isActive(link.path)
                  ? 'var(--color-brand-bright, #BA68C8)'
                  : 'var(--color-text-secondary, #94A3B8)',
                padding: '8px 0',
              }}
            >
              {link.label}
            </Link>
          ))}

          <div style={{ borderTop: '1px solid var(--color-border, #262B3F)', paddingTop: '16px' }}>
            {isAuthenticated ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {team && (
                  <div style={{ fontSize: '0.875rem' }}>
                    Team: <strong>{team.name}</strong> ({team.score} pts)
                  </div>
                )}
                <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                  User: {user?.username} {isAdmin && '(Admin)'}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    logout();
                  }}
                >
                  Logout
                </Button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '12px' }}>
                <Link to="/login" onClick={() => setMobileMenuOpen(false)} style={{ flex: 1 }}>
                  <Button variant="secondary" size="sm" style={{ width: '100%' }}>
                    Sign In
                  </Button>
                </Link>
                <Link to="/register" onClick={() => setMobileMenuOpen(false)} style={{ flex: 1 }}>
                  <Button variant="primary" size="sm" style={{ width: '100%' }}>
                    Register
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Responsive media styling */}
      <style>{`
        @media (min-width: 768px) {
          .desktop-nav { display: flex !important; }
          .desktop-actions { display: flex !important; }
          .mobile-toggle { display: none !important; }
        }
      `}</style>
    </header>
  );
};
