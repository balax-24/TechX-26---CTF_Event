import React from 'react';

interface CardProps {
  children: React.ReactNode;
  variant?: 'default' | 'elevated' | 'interactive';
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  style,
  onClick,
}) => {
  const isInteractive = variant === 'interactive' || !!onClick;

  return (
    <div
      onClick={onClick}
      style={{
        backgroundColor: variant === 'elevated' ? 'var(--color-surface-elevated, #1F2438)' : 'var(--color-surface, #161926)',
        border: '1px solid var(--color-border, #262B3F)',
        borderRadius: 'var(--radius-lg, 12px)',
        padding: 'var(--space-6, 1.5rem)',
        boxShadow: variant === 'elevated' ? 'var(--shadow-lg)' : 'var(--shadow-md)',
        transition: isInteractive ? 'transform var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast)' : undefined,
        cursor: isInteractive ? 'pointer' : 'default',
        ...style,
      }}
      onMouseEnter={(e) => {
        if (isInteractive) {
          e.currentTarget.style.borderColor = 'var(--color-brand-light, #8E24AA)';
          e.currentTarget.style.boxShadow = 'var(--shadow-glow, 0 0 20px rgba(106, 27, 154, 0.4))';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }
      }}
      onMouseLeave={(e) => {
        if (isInteractive) {
          e.currentTarget.style.borderColor = 'var(--color-border, #262B3F)';
          e.currentTarget.style.boxShadow = variant === 'elevated' ? 'var(--shadow-lg)' : 'var(--shadow-md)';
          e.currentTarget.style.transform = 'none';
        }
      }}
    >
      {children}
    </div>
  );
};
