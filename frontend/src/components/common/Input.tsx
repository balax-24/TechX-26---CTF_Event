import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  id,
  style,
  ...props
}) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
      {label && (
        <label
          htmlFor={inputId}
          style={{
            fontSize: 'var(--text-sm, 0.875rem)',
            fontWeight: 600,
            color: error ? 'var(--color-danger, #EF4444)' : 'var(--color-text-secondary, #94A3B8)',
          }}
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        style={{
          borderColor: error ? 'var(--color-danger, #EF4444)' : undefined,
          ...style,
        }}
        {...props}
      />
      {error ? (
        <span
          role="alert"
          style={{
            fontSize: 'var(--text-xs, 0.75rem)',
            color: 'var(--color-danger, #EF4444)',
            marginTop: '2px',
          }}
        >
          {error}
        </span>
      ) : helperText ? (
        <span
          style={{
            fontSize: 'var(--text-xs, 0.75rem)',
            color: 'var(--color-text-muted, #64748B)',
            marginTop: '2px',
          }}
        >
          {helperText}
        </span>
      ) : null}
    </div>
  );
};
