import React, { useState } from 'react';
import { Hint } from '../../types/api';
import { Button } from '../common/Button';
import { challengesApi } from '../../api/challenges';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { useCompetition } from '../../contexts/CompetitionContext';

interface HintCardProps {
  challengeSlug: string;
  hint: Hint;
  onHintUnlocked: (updatedHint: { id: string; content: string; penaltyPoints: number }) => void;
}

export const HintCard: React.FC<HintCardProps> = ({
  challengeSlug,
  hint,
  onHintUnlocked,
}) => {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const { showToast } = useToast();
  const { refreshProfile } = useAuth();
  const { isPaused, isEnded } = useCompetition();

  const handleUnlock = async () => {
    setIsUnlocking(true);
    try {
      const unlocked = await challengesApi.unlockHint(challengeSlug, hint.id);
      onHintUnlocked(unlocked);
      showToast(`Hint unlocked! -${hint.penaltyPoints} points deducted.`, 'info');
      await refreshProfile();
    } catch (err: any) {
      showToast(err.message || 'Failed to unlock hint', 'error');
    } finally {
      setIsUnlocking(false);
      setIsConfirming(false);
    }
  };

  const isDisabled = isPaused || isEnded;

  return (
    <div
      style={{
        backgroundColor: 'var(--color-surface-sunken, #090B10)',
        border: '1px solid var(--color-border, #262B3F)',
        borderRadius: 'var(--radius-md, 8px)',
        padding: '12px 16px',
        marginBottom: '10px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div>
          <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
            Hint {hint.hintNumber}
          </span>
          {!hint.isUnlocked && (
            <span
              style={{
                marginLeft: '8px',
                fontSize: '0.75rem',
                color: 'var(--color-warning, #F59E0B)',
                fontWeight: 600,
              }}
            >
              (Penalty: -{hint.penaltyPoints} pts)
            </span>
          )}
        </div>

        {hint.isUnlocked ? (
          <span
            style={{
              fontSize: '0.75rem',
              color: 'var(--color-success, #10B981)',
              fontWeight: 600,
            }}
          >
            UNLOCKED
          </span>
        ) : isConfirming ? (
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant="danger"
              size="sm"
              isLoading={isUnlocking}
              disabled={isDisabled}
              onClick={handleUnlock}
            >
              Confirm (-{hint.penaltyPoints})
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={isUnlocking}
              onClick={() => setIsConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={isDisabled}
            onClick={() => setIsConfirming(true)}
          >
            Unlock Hint
          </Button>
        )}
      </div>

      {hint.isUnlocked && hint.content && (
        <div
          style={{
            marginTop: '10px',
            paddingTop: '10px',
            borderTop: '1px solid var(--color-border, #262B3F)',
            color: 'var(--color-text, #F8FAFC)',
            fontSize: '0.875rem',
            lineHeight: 1.5,
          }}
        >
          {hint.content}
        </div>
      )}
    </div>
  );
};
