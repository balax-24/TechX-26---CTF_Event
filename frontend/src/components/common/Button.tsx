import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  style,
  ...props
}) => {
  const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
    primary: {
      backgroundColor: 'var(--color-brand, #6A1B9A)',
      color: '#FFFFFF',
      border: '1px solid var(--color-brand-light, #8E24AA)',
      boxShadow: '0 2px 4px rgba(106, 27, 154, 0.4)',
    },
    secondary: {
      backgroundColor: 'var(--color-surface-hover, #1E2336)',
      color: 'var(--color-text, #F8FAFC)',
      border: '1px solid var(--color-border-light, #363D59)',
    },
    outline: {
      backgroundColor: 'transparent',
      color: 'var(--color-brand-bright, #BA68C8)',
      border: '1px solid var(--color-brand, #6A1B9A)',
    },
    danger: {
      backgroundColor: 'var(--color-danger, #EF4444)',
      color: '#FFFFFF',
      border: '1px solid #DC2626',
    },
    ghost: {
      backgroundColor: 'transparent',
      color: 'var(--color-text-secondary, #94A3B8)',
      border: '1px solid transparent',
    },
  };

  const sizeStyles: Record<'sm' | 'md' | 'lg', React.CSSProperties> = {
    sm: {
      padding: '6px 12px',
      fontSize: 'var(--text-xs, 0.75rem)',
      borderRadius: 'var(--radius-sm, 6px)',
    },
    md: {
      padding: '8px 16px',
      fontSize: 'var(--text-sm, 0.875rem)',
      borderRadius: 'var(--radius-md, 8px)',
    },
    lg: {
      padding: '12px 24px',
      fontSize: 'var(--text-base, 1rem)',
      borderRadius: 'var(--radius-lg, 12px)',
    },
  };

  return (
    <button
      disabled={disabled || isLoading}
      style={{
        ...variantStyles[variant],
        ...sizeStyles[size],
        opacity: disabled || isLoading ? 0.6 : 1,
        cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
        ...style,
      }}
      {...props}
    >
      {isLoading && (
        <span
          style={{
            display: 'inline-block',
            width: '14px',
            height: '14px',
            border: '2px solid rgba(255,255,255,0.3)',
            borderTopColor: '#FFFFFF',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
      )}
      {children}
    </button>
  );
};
