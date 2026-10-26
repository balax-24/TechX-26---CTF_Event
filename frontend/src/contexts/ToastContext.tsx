import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const activeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    const timer = activeTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      activeTimersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', duration = 4000) => {
      setToasts((prev) => {
        // Prevent duplicate toasts with identical message and type from spamming the UI
        if (prev.some((t) => t.message === message && t.type === type)) {
          return prev;
        }

        const id = Math.random().toString(36).substring(2, 9);
        const newToast: Toast = { id, message, type, duration };

        if (duration > 0) {
          const timer = setTimeout(() => {
            removeToast(id);
            activeTimersRef.current.delete(id);
          }, duration);
          activeTimersRef.current.set(id, timer);
        }

        return [...prev, newToast];
      });
    },
    [removeToast]
  );

  useEffect(() => {
    return () => {
      activeTimersRef.current.forEach((timer) => clearTimeout(timer));
      activeTimersRef.current.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
      <div
        className="toast-container"
        aria-live="polite"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          zIndex: 9999,
          maxWidth: '380px',
          width: 'calc(100% - 48px)',
        }}
      >
        {toasts.map((toast) => {
          const borderColors: Record<ToastType, string> = {
            success: 'var(--color-success, #10B981)',
            error: 'var(--color-danger, #EF4444)',
            warning: 'var(--color-warning, #F59E0B)',
            info: 'var(--color-info, #6366F1)',
          };

          return (
            <div
              key={toast.id}
              role="status"
              style={{
                backgroundColor: 'var(--color-surface, #161926)',
                borderLeft: `4px solid ${borderColors[toast.type]}`,
                color: 'var(--color-text, #F8FAFC)',
                padding: '12px 16px',
                borderRadius: 'var(--radius-md, 8px)',
                boxShadow: 'var(--shadow-lg, 0 10px 15px -3px rgba(0,0,0,0.5))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                fontSize: '0.875rem',
                border: `1px solid var(--color-border, #262B3F)`,
                borderLeftWidth: '4px',
              }}
            >
              <span>{toast.message}</span>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-text-muted, #64748B)',
                  cursor: 'pointer',
                  minWidth: '32px',
                  minHeight: '32px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '4px',
                  fontSize: '1rem',
                  lineHeight: 1,
                }}
                aria-label="Dismiss toast"
              >
                &times;
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
