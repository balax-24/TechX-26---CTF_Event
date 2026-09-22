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
  const describedById = error
    ? inputId ? `${inputId}-error` : undefined
    : helperText
    ? inputId ? `${inputId}-helper` : undefined
    : undefined;

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
        aria-invalid={!!error}
        aria-describedby={describedById || props['aria-describedby']}
        style={{
          borderColor: error ? 'var(--color-danger, #EF4444)' : undefined,
          ...style,
        }}
        {...props}
      />
      {error ? (
        <span
          id={inputId ? `${inputId}-error` : undefined}
          role="alert"
          aria-live="polite"
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
          id={inputId ? `${inputId}-helper` : undefined}
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
