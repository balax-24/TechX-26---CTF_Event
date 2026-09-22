import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCompetition } from '../contexts/CompetitionContext';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Countdown } from '../components/common/Countdown';

export const DashboardPage: React.FC = () => {
  const { user, team } = useAuth();
  const { competition, state, isLive, isPaused, isEnded } = useCompetition();

  const getStatusBadge = () => {
    if (isPaused) return <Badge variant="warning">PAUSED</Badge>;
    if (isEnded) return <Badge variant="danger">ENDED</Badge>;
    if (isLive) return <Badge variant="success">LIVE</Badge>;
    return <Badge variant="neutral">{state.toUpperCase()}</Badge>;
  };

  return (
    <div className="container" style={{ padding: '32px 16px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Top Welcome & Status Banner */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '20px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <h1 style={{ fontSize: 'var(--text-2xl, 1.5rem)' }}>
              Welcome back, {user?.username}
            </h1>
            {getStatusBadge()}
          </div>
          <p style={{ fontSize: 'var(--text-sm, 0.875rem)' }}>
            TechX Madras 2026 &bull; {competition?.name || 'Cybersecurity CTF'}
          </p>
        </div>

        <Countdown />
      </div>

      {/* Team Summary Card */}
      {team ? (
        <Card variant="elevated">
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              borderBottom: '1px solid var(--color-border, #262B3F)',
              paddingBottom: '16px',
              marginBottom: '16px',
            }}
          >
            <div>
              <span
                style={{
                  fontSize: 'var(--text-xs, 0.75rem)',
                  color: 'var(--color-text-muted, #64748B)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                }}
              >
                Your Team
              </span>
              <h2 style={{ fontSize: 'var(--text-xl, 1.25rem)', color: 'var(--color-text, #F8FAFC)' }}>
                {team.name}
              </h2>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Badge
                variant={
                  team.status === 'ACTIVE'
                    ? 'success'
                    : team.status === 'DISQUALIFIED'
                    ? 'danger'
                    : 'warning'
                }
              >
                {team.status}
              </Badge>
              <Link to="/team">
                <Button variant="outline" size="sm">
                  Manage Team &rarr;
                </Button>
              </Link>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '16px',
            }}
          >
            <div
              style={{
                backgroundColor: 'var(--color-surface-sunken, #090B10)',
                padding: '16px',
                borderRadius: 'var(--radius-md, 8px)',
                border: '1px solid var(--color-border, #262B3F)',
              }}
            >
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #64748B)', textTransform: 'uppercase' }}>
                Total Points
              </span>
              <div
                className="font-mono"
                style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-brand-bright, #BA68C8)', marginTop: '4px' }}
              >
                {team.score}
              </div>
            </div>

            <div
              style={{
                backgroundColor: 'var(--color-surface-sunken, #090B10)',
                padding: '16px',
                borderRadius: 'var(--radius-md, 8px)',
                border: '1px solid var(--color-border, #262B3F)',
              }}
            >
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #64748B)', textTransform: 'uppercase' }}>
                Solved Challenges
              </span>
              <div
                className="font-mono"
                style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-success, #10B981)', marginTop: '4px' }}
              >
                {team.solves?.length || 0}
              </div>
            </div>

            <div
              style={{
                backgroundColor: 'var(--color-surface-sunken, #090B10)',
                padding: '16px',
                borderRadius: 'var(--radius-md, 8px)',
                border: '1px solid var(--color-border, #262B3F)',
              }}
            >
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #64748B)', textTransform: 'uppercase' }}>
                Roster Members
              </span>
              <div
                className="font-mono"
                style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-text, #F8FAFC)', marginTop: '4px' }}
              >
                {team.members?.length || 1} / 4
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <Card variant="elevated" style={{ textAlign: 'center', padding: '32px 16px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>👥</div>
          <h2 style={{ fontSize: 'var(--text-xl, 1.25rem)', marginBottom: '8px' }}>
            You are not in a team yet
          </h2>
          <p style={{ maxWidth: '440px', margin: '0 auto 20px', fontSize: 'var(--text-sm, 0.875rem)' }}>
            To participate in challenges and earn points on the leaderboard, you must either create a new team or join an existing team using an invite code.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <Link to="/team">
              <Button variant="primary">Create or Join a Team</Button>
            </Link>
          </div>
        </Card>
      )}

      {/* Quick Action Navigation Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '24px',
        }}
      >
        <Card variant="interactive">
          <Link to="/challenges" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ fontSize: '1.75rem', marginBottom: '12px' }}>🎯</div>
            <h3 style={{ marginBottom: '8px' }}>Challenge Arena</h3>
            <p style={{ fontSize: 'var(--text-sm, 0.875rem)', marginBottom: '16px' }}>
              Browse released challenges across Web, Pwn, Crypto, Forensics, and Reverse categories.
            </p>
            <span style={{ color: 'var(--color-brand-bright, #BA68C8)', fontWeight: 600, fontSize: '0.875rem' }}>
              View Challenges &rarr;
            </span>
          </Link>
        </Card>

        <Card variant="interactive">
          <Link to="/leaderboard" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ fontSize: '1.75rem', marginBottom: '12px' }}>📊</div>
            <h3 style={{ marginBottom: '8px' }}>Live Leaderboard</h3>
            <p style={{ fontSize: 'var(--text-sm, 0.875rem)', marginBottom: '16px' }}>
              Inspect live real-time standings with monotonic version tracking and instant score sync.
            </p>
            <span style={{ color: 'var(--color-brand-bright, #BA68C8)', fontWeight: 600, fontSize: '0.875rem' }}>
              View Standings &rarr;
            </span>
          </Link>
        </Card>
      </div>
    </div>
  );
};
