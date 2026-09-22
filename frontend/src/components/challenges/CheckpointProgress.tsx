import React, { useState } from 'react';
import { Checkpoint } from '../../types/api';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { checkpointsApi } from '../../api/checkpoints';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { useCompetition } from '../../contexts/CompetitionContext';

interface CheckpointProgressProps {
  checkpoints: Checkpoint[];
  onCheckpointCompleted: (checkpointId: string, newScore: number) => void;
}

export const CheckpointProgress: React.FC<CheckpointProgressProps> = ({
  checkpoints,
  onCheckpointCompleted,
}) => {
  const [proofInputs, setProofInputs] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const { showToast } = useToast();
  const { refreshProfile } = useAuth();
  const { isPaused, isEnded } = useCompetition();

  if (!checkpoints || checkpoints.length === 0) {
    return null;
  }

  // Sort by stepNumber ascending
  const sorted = [...checkpoints].sort((a, b) => a.stepNumber - b.stepNumber);

  const handleValidate = async (checkpoint: Checkpoint) => {
    const proof = proofInputs[checkpoint.id]?.trim();
    setSubmittingId(checkpoint.id);

    try {
      const result = await checkpointsApi.validateCheckpoint(checkpoint.id, proof);
      if (result.success && result.status === 'passed') {
        showToast(`Checkpoint ${checkpoint.stepNumber} passed! +${result.pointsAwarded} pts`, 'success');
        onCheckpointCompleted(checkpoint.id, result.newScore);
        await refreshProfile();
      } else {
        showToast('Proof invalid or checkpoint not yet satisfied.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Checkpoint validation failed', 'error');
    } finally {
      setSubmittingId(null);
    }
  };

  const isDisabled = isPaused || isEnded;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <h4 style={{ fontSize: 'var(--text-sm, 0.875rem)', color: 'var(--color-text-secondary, #94A3B8)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Checkpoint Progression
      </h4>

      {sorted.map((cp, idx) => {
        // Is available if first or preceding checkpoint is solved
        const isPrevSolved = idx === 0 || sorted[idx - 1].isSolved;
        const isLocked = !cp.isSolved && !isPrevSolved;

        return (
          <div
            key={cp.id}
            style={{
              padding: '12px 16px',
              backgroundColor: cp.isSolved
                ? 'var(--color-surface, #161926)'
                : isLocked
                ? 'var(--color-surface-sunken, #090B10)'
                : 'var(--color-surface-elevated, #1F2438)',
              border: `1px solid ${
                cp.isSolved
                  ? 'var(--color-success-border, rgba(16, 185, 129, 0.3))'
                  : 'var(--color-border, #262B3F)'
              }`,
              borderRadius: 'var(--radius-md, 8px)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1rem' }}>
                  {cp.isSolved ? '✓' : isLocked ? '🔒' : '📍'}
                </span>
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    color: cp.isSolved
                      ? 'var(--color-success, #10B981)'
                      : isLocked
                      ? 'var(--color-text-muted, #64748B)'
                      : 'var(--color-text, #F8FAFC)',
                  }}
                >
                  Step {cp.stepNumber}: {cp.title}
                </span>
              </div>
              <span
                className="font-mono"
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--color-brand-bright, #BA68C8)',
                }}
              >
                +{cp.points} pts
              </span>
            </div>

            {cp.description && (
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #64748B)' }}>
                {cp.description}
              </p>
            )}

            {!cp.isSolved && !isLocked && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <Input
                  placeholder="Enter checkpoint proof / token..."
                  value={proofInputs[cp.id] || ''}
                  onChange={(e) =>
                    setProofInputs((prev) => ({ ...prev, [cp.id]: e.target.value }))
                  }
                  disabled={isDisabled || submittingId === cp.id}
                  style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                />
                <Button
                  size="sm"
                  variant="primary"
                  isLoading={submittingId === cp.id}
                  disabled={isDisabled}
                  onClick={() => handleValidate(cp)}
                >
                  Validate
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
