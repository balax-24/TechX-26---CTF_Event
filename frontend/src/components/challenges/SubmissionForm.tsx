import React, { useState } from 'react';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { submissionsApi } from '../../api/submissions';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { useCompetition } from '../../contexts/CompetitionContext';

interface SubmissionFormProps {
  challengeId: string;
  isSolved?: boolean;
  onSolveSuccess: (pointsAwarded: number, newScore: number) => void;
}

export const SubmissionForm: React.FC<SubmissionFormProps> = ({
  challengeId,
  isSolved = false,
  onSolveSuccess,
}) => {
  const [flag, setFlag] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const { showToast } = useToast();
  const { refreshProfile, team } = useAuth();
  const { isPaused, isEnded } = useCompetition();

  const isDisqualified = team?.status === 'DISQUALIFIED';
  const isDisabled = isSolved || isPaused || isEnded || isDisqualified || isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = flag.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const result = await submissionsApi.submitFlag(challengeId, trimmed);

      if (result.success && result.status === 'correct') {
        setFeedback({
          type: 'success',
          message: `Challenge Solved! +${result.pointsAwarded} points awarded to your team.`,
        });
        showToast(`Challenge Solved! +${result.pointsAwarded} pts`, 'success');
        onSolveSuccess(result.pointsAwarded, result.newScore);
        await refreshProfile();
        setFlag('');
      } else if (result.status === 'already_solved') {
        setFeedback({
          type: 'success',
          message: 'Your team has already solved this challenge!',
        });
      } else {
        setFeedback({
          type: 'error',
          message: 'Incorrect flag. The submitted flag was not accepted.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to process flag submission.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSolved) {
    return (
      <div
        style={{
          padding: '16px',
          backgroundColor: 'var(--color-success-bg, rgba(16, 185, 129, 0.12))',
          border: '1px solid var(--color-success-border, rgba(16, 185, 129, 0.3))',
          borderRadius: 'var(--radius-md, 8px)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          color: 'var(--color-success, #10B981)',
          fontWeight: 600,
          fontSize: '0.875rem',
        }}
      >
        <span style={{ fontSize: '1.25rem' }}>✓</span>
        <span>This challenge has already been solved by your team.</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <label
        htmlFor="flag-input"
        style={{
          fontSize: 'var(--text-sm, 0.875rem)',
          fontWeight: 600,
          color: 'var(--color-text, #F8FAFC)',
        }}
      >
        Submit Flag
      </label>

      <div style={{ display: 'flex', gap: '8px' }}>
        <Input
          id="flag-input"
          placeholder="flag{...} or techx{...}"
          value={flag}
          onChange={(e) => setFlag(e.target.value)}
          disabled={isDisabled}
          className="font-mono"
          style={{ flex: 1 }}
          required
        />
        <Button
          type="submit"
          variant="primary"
          isLoading={isSubmitting}
          disabled={isDisabled || !flag.trim()}
          style={{ minWidth: '100px' }}
        >
          Submit
        </Button>
      </div>

      {feedback && (
        <div
          role="alert"
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-md, 8px)',
            fontSize: 'var(--text-xs, 0.75rem)',
            fontWeight: 600,
            backgroundColor:
              feedback.type === 'success'
                ? 'var(--color-success-bg, rgba(16, 185, 129, 0.15))'
                : 'var(--color-danger-bg, rgba(239, 68, 68, 0.15))',
            border: `1px solid ${
              feedback.type === 'success'
                ? 'var(--color-success-border, rgba(16, 185, 129, 0.4))'
                : 'var(--color-danger-border, rgba(239, 68, 68, 0.4))'
            }`,
            color:
              feedback.type === 'success'
                ? 'var(--color-success, #10B981)'
                : 'var(--color-danger, #EF4444)',
          }}
        >
          {feedback.message}
        </div>
      )}
    </form>
  );
};
