import React from 'react';
import { Challenge, ChallengeDifficulty } from '../../types/api';
import { Card } from '../common/Card';
import { Badge, BadgeVariant } from '../common/Badge';

interface ChallengeCardProps {
  challenge: Challenge;
  onClick: () => void;
}

export const ChallengeCard: React.FC<ChallengeCardProps> = ({ challenge, onClick }) => {
  const difficultyVariant: Record<ChallengeDifficulty, BadgeVariant> = {
    beginner: 'success',
    intermediate: 'warning',
    expert: 'danger',
  };

  return (
    <Card
      variant="interactive"
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
        minHeight: '180px',
        position: 'relative',
        overflow: 'hidden',
        borderLeft: challenge.isSolved
          ? '4px solid var(--color-success, #10B981)'
          : '1px solid var(--color-border, #262B3F)',
      }}
    >
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            marginBottom: '12px',
          }}
        >
          <span
            style={{
              fontSize: 'var(--text-xs, 0.75rem)',
              color: 'var(--color-text-muted, #64748B)',
              fontWeight: 600,
              textTransform: 'uppercase',
            }}
          >
            {challenge.category}
          </span>
          <Badge variant={difficultyVariant[challenge.difficulty]} size="sm">
            {challenge.difficulty}
          </Badge>
        </div>

        <h3
          style={{
            fontSize: 'var(--text-lg, 1.125rem)',
            color: challenge.isSolved ? 'var(--color-success, #10B981)' : 'var(--color-text, #F8FAFC)',
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {challenge.title}
          {challenge.isSolved && <span>✓</span>}
        </h3>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid var(--color-border, #262B3F)',
          paddingTop: '12px',
          marginTop: '16px',
        }}
      >
        <span
          className="font-mono"
          style={{
            fontSize: 'var(--text-lg, 1.125rem)',
            fontWeight: 700,
            color: 'var(--color-brand-bright, #BA68C8)',
          }}
        >
          {challenge.points} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>PTS</span>
        </span>

        <span
          style={{
            fontSize: 'var(--text-xs, 0.75rem)',
            color: 'var(--color-text-muted, #64748B)',
          }}
        >
          {challenge.solveCount} {challenge.solveCount === 1 ? 'solve' : 'solves'}
        </span>
      </div>
    </Card>
  );
};
