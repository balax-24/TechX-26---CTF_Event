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
        { label: 'DASHBOARD', path: '/dashboard' },
        { label: 'CHALLENGES', path: '/challenges' },
        { label: 'LEADERBOARD', path: '/leaderboard' },
        { label: 'TEAM', path: '/team' },
      ]
    : [
        { label: 'HOME', path: '/' },
        { label: 'CHALLENGES', path: '/challenges' },
        { label: 'LEADERBOARD', path: '/leaderboard' },
      ];

  return (
    <header
      style={{
        height: 'var(--nav-height, 60px)',
        backgroundColor: 'var(--color-surface, #11141D)',
        borderBottom: '1px solid var(--color-border, #1E2335)',
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
        {/* Official TechX Logo */}
        <Link
          to={isAuthenticated ? '/dashboard' : '/'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            textDecoration: 'none',
          }}
        >
          <img
            src="/TechX White New.png"
            alt="TechX Madras 2026"
            style={{
              height: '34px',
              width: 'auto',
              maxHeight: '34px',
              objectFit: 'contain',
              display: 'block',
            }}
          />
          <div
            style={{
              borderLeft: '1px solid var(--color-border-light, #2A3147)',
              paddingLeft: '10px',
              display: 'flex',
              flexDirection: 'column',
              lineHeight: 1.1,
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.65rem',
                letterSpacing: '0.15em',
                color: 'var(--color-brand-bright, #BA68C8)',
                fontWeight: 700,
                textTransform: 'uppercase',
              }}
            >
              CTF 2026
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.6rem',
                letterSpacing: '0.08em',
                color: 'var(--color-text-muted, #64748B)',
              }}
            >
              DEFENSE ARENA
            </span>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav
          style={{
            display: 'none',
            alignItems: 'center',
            gap: '28px',
          }}
          className="desktop-nav"
        >
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-xs, 0.75rem)',
                fontWeight: 600,
                letterSpacing: '0.08em',
                color: isActive(link.path)
                  ? 'var(--color-brand-bright, #BA68C8)'
                  : 'var(--color-text-secondary, #94A3B8)',
                padding: '6px 2px',
                borderBottom: isActive(link.path)
                  ? '2px solid var(--color-brand-bright, #BA68C8)'
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
            gap: '14px',
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
                    backgroundColor: 'var(--color-surface-sunken, #07080C)',
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-sm, 2px)',
                    border: '1px solid var(--color-border, #1E2335)',
                    fontSize: 'var(--text-xs, 0.75rem)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  <span style={{ color: 'var(--color-text-muted, #64748B)' }}>TEAM:</span>
                  <span style={{ fontWeight: 700, color: 'var(--color-text, #F8FAFC)' }}>
                    {team.name}
                  </span>
                  <span
                    style={{
                      backgroundColor: 'var(--color-brand-muted, rgba(106, 27, 154, 0.15))',
                      color: 'var(--color-brand-bright, #BA68C8)',
                      padding: '1px 6px',
                      borderRadius: '2px',
                      fontWeight: 700,
                      border: '1px solid var(--color-brand, #6A1B9A)',
                    }}
                  >
                    {team.score} PTS
                  </span>
                </div>
              )}

              {isAdmin && (
                <span
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    color: '#EF4444',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    padding: '2px 6px',
                    borderRadius: 'var(--radius-sm, 2px)',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '0.05em',
                  }}
                  title="Administrative account"
                >
                  ADMIN
                </span>
              )}

              <span
                style={{
                  fontSize: 'var(--text-xs, 0.75rem)',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-text-secondary, #94A3B8)',
                }}
              >
                {user?.username}
              </span>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => logout()}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-xs, 0.75rem)',
                  letterSpacing: '0.05em',
                }}
              >
                LOGOUT
              </Button>
            </>
          ) : (
            <Link to="/login">
              <Button
                variant="primary"
                size="sm"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-xs, 0.75rem)',
                  letterSpacing: '0.08em',
                  padding: '6px 16px',
                }}
              >
                SIGN IN
              </Button>
            </Link>
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
            fontSize: '1.25rem',
            cursor: 'pointer',
            padding: '10px',
            minHeight: '44px',
            minWidth: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
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
            top: 'var(--nav-height, 60px)',
            left: 0,
            right: 0,
            backgroundColor: 'var(--color-surface, #11141D)',
            borderBottom: '1px solid var(--color-border, #1E2335)',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              onClick={() => setMobileMenuOpen(false)}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm, 0.875rem)',
                fontWeight: 600,
                color: isActive(link.path)
                  ? 'var(--color-brand-bright, #BA68C8)'
                  : 'var(--color-text, #F8FAFC)',
                padding: '10px 0',
                borderBottom: '1px solid var(--color-border, #1E2335)',
                display: 'block',
                minHeight: '44px',
              }}
            >
              {link.label}
            </Link>
          ))}

          {isAuthenticated ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '8px' }}>
              <div
                style={{
                  fontSize: 'var(--text-xs, 0.75rem)',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-text-secondary, #94A3B8)',
                }}
              >
                OPERATOR: <span style={{ color: '#FFFFFF', fontWeight: 700 }}>{user?.username}</span>
                {team && ` | TEAM: ${team.name} (${team.score} pts)`}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setMobileMenuOpen(false);
                  logout();
                }}
                style={{ minHeight: '44px', fontFamily: 'var(--font-mono)' }}
              >
                LOGOUT
              </Button>
            </div>
          ) : (
            <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
              <Button
                variant="primary"
                size="sm"
                style={{ width: '100%', minHeight: '44px', fontFamily: 'var(--font-mono)' }}
              >
                SIGN IN
              </Button>
            </Link>
          )}
        </div>
      )}

      {/* Responsive Media Query Styles */}
      <style>{`
        @media (min-width: 768px) {
          .desktop-nav {
            display: flex !important;
          }
          .desktop-actions {
            display: flex !important;
          }
          .mobile-toggle {
            display: none !important;
          }
        }
      `}</style>
    </header>
  );
};
