import React from 'react';
import { Button } from '../common/Button';

export const LoadingSkeleton: React.FC<{ rows?: number; height?: string }> = ({
  rows = 3,
  height = '60px',
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            height,
            backgroundColor: 'var(--color-surface, #161926)',
            borderRadius: 'var(--radius-md, 8px)',
            border: '1px solid var(--color-border, #262B3F)',
            opacity: 0.6,
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
      ))}
    </div>
  );
};

export const ErrorState: React.FC<{
  title?: string;
  message?: string;
  onRetry?: () => void;
}> = ({
  title = 'Failed to load content',
  message = 'An unexpected error occurred while communicating with the server.',
  onRetry,
}) => {
  return (
    <div
      style={{
        padding: '48px 24px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
        backgroundColor: 'var(--color-surface, #161926)',
        border: '1px solid var(--color-border, #262B3F)',
        borderRadius: 'var(--radius-lg, 12px)',
      }}
    >
      <div style={{ fontSize: '2.5rem' }}>⚠️</div>
      <h3 style={{ fontSize: 'var(--text-lg, 1.125rem)', color: 'var(--color-danger, #EF4444)' }}>
        {title}
      </h3>
      <p style={{ maxWidth: '440px', fontSize: 'var(--text-sm, 0.875rem)' }}>{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try Again
        </Button>
      )}
    </div>
  );
};

export const EmptyState: React.FC<{
  title?: string;
  message?: string;
  icon?: string;
}> = ({
  title = 'No items found',
  message = 'There is currently nothing to display in this view.',
  icon = '📂',
}) => {
  return (
    <div
      style={{
        padding: '48px 24px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
        backgroundColor: 'var(--color-surface, #161926)',
        border: '1px dashed var(--color-border, #262B3F)',
        borderRadius: 'var(--radius-lg, 12px)',
      }}
    >
      <div style={{ fontSize: '2.5rem' }}>{icon}</div>
      <h3 style={{ fontSize: 'var(--text-lg, 1.125rem)' }}>{title}</h3>
      <p style={{ maxWidth: '400px', fontSize: 'var(--text-sm, 0.875rem)' }}>{message}</p>
    </div>
  );
};
