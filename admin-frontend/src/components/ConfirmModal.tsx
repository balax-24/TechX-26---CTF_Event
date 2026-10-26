import React, { useState } from 'react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  warningNote?: string;
  requiredPhrase?: string; // If specified, user must type this exact phrase to confirm
  confirmLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  warningNote,
  requiredPhrase,
  confirmLabel = 'Confirm Action',
  isDestructive = true,
  onConfirm,
  onCancel,
}) => {
  const [typedPhrase, setTypedPhrase] = useState('');

  if (!isOpen) return null;

  const isPhraseMatched = !requiredPhrase || typedPhrase.trim() === requiredPhrase.trim();

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '460px' }}>
        <div style={{
          borderBottom: '1px solid var(--border-dim)',
          paddingBottom: '10px',
          marginBottom: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{
            color: isDestructive ? 'var(--status-red)' : 'var(--accent-cyan)',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            fontSize: '13px'
          }}>
            [CRITICAL OPERATION]
          </span>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {title}
          </span>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '12px' }}>
          {message}
        </p>

        {warningNote && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            borderLeft: '3px solid var(--status-red)',
            padding: '8px 12px',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            color: '#fca5a5',
            marginBottom: '14px',
          }}>
            WARNING: {warningNote}
          </div>
        )}

        {requiredPhrase && (
          <div style={{ marginBottom: '16px' }}>
            <label className="form-label" style={{ color: 'var(--status-red)' }}>
              Type "{requiredPhrase}" to authorize this operation:
            </label>
            <input
              type="text"
              value={typedPhrase}
              onChange={(e) => setTypedPhrase(e.target.value)}
              placeholder={requiredPhrase}
              autoFocus
              style={{
                borderColor: typedPhrase === requiredPhrase ? 'var(--status-green)' : 'var(--border-dim)',
                fontFamily: 'var(--font-mono)'
              }}
            />
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setTypedPhrase('');
              onCancel();
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${isDestructive ? 'btn-danger' : 'btn-primary'}`}
            disabled={!isPhraseMatched}
            style={{ opacity: isPhraseMatched ? 1 : 0.4, cursor: isPhraseMatched ? 'pointer' : 'not-allowed' }}
            onClick={() => {
              if (isPhraseMatched) {
                setTypedPhrase('');
                onConfirm();
              }
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
