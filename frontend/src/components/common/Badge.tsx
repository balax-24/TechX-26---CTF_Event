import React from 'react';

export type BadgeVariant = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'md',
}) => {
  const variantStyles: Record<BadgeVariant, { bg: string; color: string; border: string }> = {
    brand: {
      bg: 'var(--color-brand-muted, rgba(106, 27, 154, 0.15))',
      color: 'var(--color-brand-bright, #BA68C8)',
      border: 'var(--color-brand, #6A1B9A)',
    },
    success: {
      bg: 'var(--color-success-bg, rgba(16, 185, 129, 0.12))',
      color: 'var(--color-success, #10B981)',
      border: 'var(--color-success-border, rgba(16, 185, 129, 0.3))',
    },
    warning: {
      bg: 'var(--color-warning-bg, rgba(245, 158, 11, 0.12))',
      color: 'var(--color-warning, #F59E0B)',
      border: 'var(--color-warning-border, rgba(245, 158, 11, 0.3))',
    },
    danger: {
      bg: 'var(--color-danger-bg, rgba(239, 68, 68, 0.12))',
      color: 'var(--color-danger, #EF4444)',
      border: 'var(--color-danger-border, rgba(239, 68, 68, 0.3))',
    },
    info: {
      bg: 'var(--color-info-bg, rgba(99, 102, 241, 0.12))',
      color: 'var(--color-info, #6366F1)',
      border: 'var(--color-info-border, rgba(99, 102, 241, 0.3))',
    },
    neutral: {
      bg: 'var(--color-surface-hover, #1E2336)',
      color: 'var(--color-text-secondary, #94A3B8)',
      border: 'var(--color-border, #262B3F)',
    },
  };

  const style = variantStyles[variant];
  const padding = size === 'sm' ? '2px 8px' : '4px 10px';
  const fontSize = size === 'sm' ? '0.7rem' : '0.75rem';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding,
        fontSize,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        borderRadius: 'var(--radius-full, 9999px)',
        backgroundColor: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
        lineHeight: 1.2,
      }}
    >
      {children}
    </span>
  );
};
