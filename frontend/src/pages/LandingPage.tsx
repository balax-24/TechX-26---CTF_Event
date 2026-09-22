import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCompetition } from '../contexts/CompetitionContext';
import { Button } from '../components/common/Button';
import { Countdown } from '../components/common/Countdown';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';

export const LandingPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { competition, state } = useCompetition();

  const getStatusBadge = () => {
    switch (state) {
      case 'live':
        return <Badge variant="success">COMPETITION LIVE</Badge>;
      case 'paused':
        return <Badge variant="warning">TEMPORARILY PAUSED</Badge>;
      case 'ended':
      case 'archived':
        return <Badge variant="danger">COMPETITION ENDED</Badge>;
      case 'registration_open':
        return <Badge variant="info">REGISTRATION OPEN</Badge>;
      default:
        return <Badge variant="neutral">UPCOMING EVENT</Badge>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '48px', padding: '40px 0' }}>
      {/* Hero Section */}
      <section className="container" style={{ textAlign: 'center', maxWidth: '800px' }}>
        <div style={{ marginBottom: '16px' }}>{getStatusBadge()}</div>

        <h1
          style={{
            fontSize: 'clamp(2rem, 5vw, 3.5rem)',
            fontWeight: 800,
            lineHeight: 1.15,
            marginBottom: '16px',
            background: 'linear-gradient(135deg, #FFFFFF 40%, #BA68C8 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          {competition?.name || 'TechX CTF 2026'}
        </h1>

        <p
          style={{
            fontSize: 'var(--text-lg, 1.125rem)',
            color: 'var(--color-text-secondary, #94A3B8)',
            marginBottom: '32px',
          }}
        >
          Official IEEE technical flagship cybersecurity competition. Challenge your skills across
          Web, Pwn, Crypto, Forensics, Reverse Engineering, and Mixed categories with real-time scoring.
        </p>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '24px',
            marginBottom: '32px',
          }}
        >
          <Countdown />

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'center' }}>
            {isAuthenticated ? (
              <Link to="/dashboard">
                <Button size="lg" variant="primary">
                  Go to Dashboard &rarr;
                </Button>
              </Link>
            ) : (
              <>
                <Link to="/register">
                  <Button size="lg" variant="primary">
                    Register Your Team
                  </Button>
                </Link>
                <Link to="/login">
                  <Button size="lg" variant="secondary">
                    Sign In
                  </Button>
                </Link>
              </>
            )}
            <Link to="/leaderboard">
              <Button size="lg" variant="outline">
                View Leaderboard
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Feature Highlights Grid */}
      <section className="container">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '24px',
          }}
        >
          <Card>
            <div style={{ fontSize: '1.75rem', marginBottom: '12px' }}>🔒</div>
            <h3 style={{ marginBottom: '8px' }}>Sequential Checkpoints</h3>
            <p style={{ fontSize: 'var(--text-sm, 0.875rem)' }}>
              Complex multi-stage challenges with progressive milestones and server-verified proofs.
            </p>
          </Card>

          <Card>
            <div style={{ fontSize: '1.75rem', marginBottom: '12px' }}>⚡</div>
            <h3 style={{ marginBottom: '8px' }}>Real-Time Leaderboard</h3>
            <p style={{ fontSize: 'var(--text-sm, 0.875rem)' }}>
              Instant live standings powered by transactional event streams and monotonic versioning.
            </p>
          </Card>

          <Card>
            <div style={{ fontSize: '1.75rem', marginBottom: '12px' }}>🛡️</div>
            <h3 style={{ marginBottom: '8px' }}>Zero-Trust Scoring</h3>
            <p style={{ fontSize: 'var(--text-sm, 0.875rem)' }}>
              Financial-grade immutable score ledger with strict tie-breaking and post-commit guarantees.
            </p>
          </Card>
        </div>
      </section>

      {/* Rules & Guidelines */}
      <section className="container" style={{ maxWidth: '800px' }}>
        <Card variant="elevated">
          <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📜</span> Competition Rules & Conduct
          </h3>
          <ul
            style={{
              paddingLeft: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              color: 'var(--color-text-secondary, #94A3B8)',
              fontSize: 'var(--text-sm, 0.875rem)',
            }}
          >
            <li>
              <strong>Team Size:</strong> Maximum of 4 members per team. All members share points and progression.
            </li>
            <li>
              <strong>No Flag Sharing:</strong> Sharing flags, hints, or solutions across rival teams will lead to immediate disqualification.
            </li>
            <li>
              <strong>No Infrastructure Attacks:</strong> Attacking the scoreboard, authentication system, or fellow teams is strictly forbidden.
            </li>
            <li>
              <strong>Rate Limiting:</strong> Automated brute force is throttled by the platform. Focus on technical analysis rather than guessing.
            </li>
          </ul>
        </Card>
      </section>
    </div>
  );
};
