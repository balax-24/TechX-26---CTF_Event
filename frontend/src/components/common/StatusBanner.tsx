import React from 'react';
import { useCompetition } from '../../contexts/CompetitionContext';
import { useAuth } from '../../contexts/AuthContext';

export const StatusBanner: React.FC = () => {
  const { isPaused, isEnded } = useCompetition();
  const { team } = useAuth();

  const isDisqualified = team?.status === 'DISQUALIFIED';
  const isDisabled = team?.status === 'DISABLED';

  if (isDisqualified) {
    return (
      <div
        role="alert"
        style={{
          backgroundColor: 'var(--color-danger-bg, rgba(239, 68, 68, 0.15))',
          borderBottom: '1px solid var(--color-danger, #EF4444)',
          color: '#FECACA',
          padding: '12px 24px',
          textAlign: 'center',
          fontSize: 'var(--text-sm, 0.875rem)',
          fontWeight: 600,
        }}
      >
        <span style={{ marginRight: '8px' }}>⚠️</span>
        <strong>Team Disqualified:</strong> Your team has been disqualified. Access to submissions and scoring is revoked.
      </div>
    );
  }

  if (isDisabled) {
    return (
      <div
        role="alert"
        style={{
          backgroundColor: 'var(--color-warning-bg, rgba(245, 158, 11, 0.15))',
          borderBottom: '1px solid var(--color-warning, #F59E0B)',
          color: '#FEF3C7',
          padding: '12px 24px',
          textAlign: 'center',
          fontSize: 'var(--text-sm, 0.875rem)',
          fontWeight: 600,
        }}
      >
        <span style={{ marginRight: '8px' }}>⚠️</span>
        <strong>Team Disabled:</strong> Your team account is currently disabled. Please contact event coordinators.
      </div>
    );
  }

  if (isPaused) {
    return (
      <div
        role="alert"
        style={{
          backgroundColor: 'var(--color-warning-bg, rgba(245, 158, 11, 0.15))',
          borderBottom: '1px solid var(--color-warning, #F59E0B)',
          color: '#FEF3C7',
          padding: '12px 24px',
          textAlign: 'center',
          fontSize: 'var(--text-sm, 0.875rem)',
          fontWeight: 600,
        }}
      >
        <span style={{ marginRight: '8px' }}>⏸️</span>
        <strong>Competition Paused:</strong> Submissions are temporarily disabled. Your team data and progress are safe. Please wait for the competition to resume.
      </div>
    );
  }

  if (isEnded) {
    return (
      <div
        role="alert"
        style={{
          backgroundColor: 'var(--color-surface-hover, #1E2336)',
          borderBottom: '1px solid var(--color-border-light, #363D59)',
          color: 'var(--color-text-secondary, #94A3B8)',
          padding: '12px 24px',
          textAlign: 'center',
          fontSize: 'var(--text-sm, 0.875rem)',
          fontWeight: 600,
        }}
      >
        <span style={{ marginRight: '8px' }}>🏁</span>
        <strong>Competition Ended:</strong> Submissions are now closed. The final leaderboard is frozen.
      </div>
    );
  }

  return null;
};
