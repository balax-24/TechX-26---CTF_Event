import React from 'react';
import { Challenge } from '../../types/api';
import { getCategoryName } from '../../utils/category';

interface ChallengeCardProps {
  challenge: Challenge;
  onClick: () => void;
}

export const ChallengeCard: React.FC<ChallengeCardProps> = ({ challenge, onClick }) => {
  const isSolved = challenge.isSolved;

  return (
    <div
      onClick={onClick}
      style={{
        backgroundColor: 'var(--color-surface, #11141D)',
        border: `1px solid ${isSolved ? 'rgba(16, 185, 129, 0.4)' : 'var(--color-border, #1E2335)'}`,
        borderLeft: isSolved ? '3px solid var(--color-success, #10B981)' : '3px solid transparent',
        borderRadius: 'var(--radius-sm, 2px)',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        cursor: 'pointer',
        transition: 'border-color 0.15s ease, background-color 0.15s ease',
        minHeight: '140px',
      }}
      onMouseEnter={(e) => {
        if (!isSolved) {
          e.currentTarget.style.borderColor = 'var(--color-brand, #6A1B9A)';
          e.currentTarget.style.backgroundColor = 'var(--color-surface-hover, #161A26)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isSolved) {
          e.currentTarget.style.borderColor = 'var(--color-border, #1E2335)';
          e.currentTarget.style.backgroundColor = 'var(--color-surface, #11141D)';
        }
      }}
    >
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '8px',
            marginBottom: '4px',
          }}
        >
          <h3
            style={{
              fontSize: '0.9375rem',
              fontWeight: 700,
              color: isSolved ? 'var(--color-success, #10B981)' : '#F8FAFC',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>{challenge.title}</span>
            {isSolved && <span>✓</span>}
          </h3>
          {isSolved && (
            <span
              className="font-mono"
              style={{
                fontSize: '0.625rem',
                fontWeight: 700,
                color: 'var(--color-success, #10B981)',
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                padding: '2px 5px',
                borderRadius: '2px',
              }}
            >
              SOLVED
            </span>
          )}
        </div>

        <div
          className="font-mono"
          style={{
            fontSize: '0.6875rem',
            color: 'var(--color-text-muted, #5A657D)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>{getCategoryName(challenge.category)}</span>
          <span>/</span>
          <span
            style={{
              color:
                challenge.difficulty === 'beginner'
                  ? 'var(--color-success, #10B981)'
                  : challenge.difficulty === 'intermediate'
                  ? 'var(--color-warning, #F59E0B)'
                  : 'var(--color-danger, #EF4444)',
            }}
          >
            {challenge.difficulty}
          </span>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid var(--color-border, #1E2335)',
          paddingTop: '10px',
          marginTop: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <div>
            <span
              className="font-mono"
              style={{
                fontSize: '1rem',
                fontWeight: 800,
                color: 'var(--color-brand-bright, #BA68C8)',
              }}
            >
              {challenge.points}
            </span>
            <span
              className="font-mono"
              style={{
                fontSize: '0.6875rem',
                color: 'var(--color-text-muted, #5A657D)',
                marginLeft: '4px',
              }}
            >
              POINTS
            </span>
          </div>

          <span
            className="font-mono"
            style={{
              fontSize: '0.6875rem',
              color: 'var(--color-text-muted, #5A657D)',
            }}
          >
            {challenge.solveCount} {challenge.solveCount === 1 ? 'solve' : 'solves'}
          </span>
        </div>

        <button
          className="font-mono"
          style={{
            fontSize: '0.6875rem',
            fontWeight: 700,
            padding: '4px 8px',
            backgroundColor: isSolved ? 'rgba(16, 185, 129, 0.1)' : 'rgba(106, 27, 154, 0.15)',
            border: `1px solid ${isSolved ? 'rgba(16, 185, 129, 0.3)' : 'var(--color-brand, #6A1B9A)'}`,
            color: isSolved ? 'var(--color-success, #10B981)' : '#BA68C8',
            borderRadius: '2px',
            cursor: 'pointer',
          }}
        >
          {isSolved ? '[ SOLVED ]' : '[ OPEN CHALLENGE ]'}
        </button>
      </div>
    </div>
  );
};
