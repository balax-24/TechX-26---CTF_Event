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
      <div style={{ color: 'var(--color-danger, #EF4444)' }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h3 style={{ fontSize: 'var(--text-lg, 1.125rem)', color: 'var(--color-danger, #EF4444)' }}>
        {title}
      </h3>
      <p style={{ maxWidth: '440px', fontSize: 'var(--text-sm, 0.875rem)', color: 'var(--color-text-secondary, #94A3B8)' }}>{message}</p>
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
        borderRadius: 'var(--radius-md, 4px)',
      }}
    >
      <div style={{ color: 'var(--color-text-muted, #64748B)' }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      </div>
      <h3 style={{ fontSize: 'var(--text-lg, 1.125rem)', color: 'var(--color-text, #F8FAFC)' }}>{title}</h3>
      <p style={{ maxWidth: '400px', fontSize: 'var(--text-sm, 0.875rem)', color: 'var(--color-text-secondary, #94A3B8)' }}>{message}</p>
    </div>
  );
};
