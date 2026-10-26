import React, { useState, useEffect } from 'react';
import { ChallengeDetail, ChallengeInstance } from '../../types/api';
import { challengesApi } from '../../api/challenges';
import { Modal } from '../common/Modal';
import { Badge, BadgeVariant } from '../common/Badge';
import { getCategoryName } from '../../utils/category';
import { SubmissionForm } from './SubmissionForm';
import { CheckpointProgress } from './CheckpointProgress';
import { HintCard } from './HintCard';
import { LoadingSkeleton, ErrorState } from '../feedback/FeedbackStates';

interface ChallengeModalProps {
  slug: string | null;
  onClose: () => void;
  onSolve: () => void;
}

export const ChallengeModal: React.FC<ChallengeModalProps> = ({
  slug,
  onClose,
  onSolve,
}) => {
  const [challenge, setChallenge] = useState<ChallengeDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [instance, setInstance] = useState<ChallengeInstance | null>(null);
  const [instanceLoading, setInstanceLoading] = useState(false);
  const [instanceError, setInstanceError] = useState<string | null>(null);

  const isIsolatedEnclave = challenge?.slug === 'dyn-cloud-sandbox';

  const loadChallenge = async (chSlug: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await challengesApi.getChallengeBySlug(chSlug);
      setChallenge(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load challenge details');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (slug) {
      loadChallenge(slug);
    } else {
      setChallenge(null);
    }
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    setInstance(null);
    setInstanceError(null);

    if (challenge?.slug === 'dyn-cloud-sandbox') {
      challengesApi
        .getChallengeInstance(challenge.slug)
        .then((activeInstance) => {
          if (!cancelled) setInstance(activeInstance);
        })
        .catch((err: any) => {
          if (!cancelled) setInstanceError(err.message || 'Could not check sandbox status');
        });
    }

    return () => {
      cancelled = true;
    };
  }, [challenge?.slug]);

  const startSandbox = async () => {
    if (!challenge) return;
    setInstanceLoading(true);
    setInstanceError(null);
    try {
      const startedInstance = await challengesApi.startChallengeInstance(challenge.slug);
      setInstance(startedInstance);
    } catch (err: any) {
      setInstanceError(err.message || 'Could not start the sandbox');
    } finally {
      setInstanceLoading(false);
    }
  };

  const resetSandbox = async () => {
    if (!challenge || !window.confirm('Reset your team’s Isolated Enclave sandbox? This replaces only your team’s current instance.')) {
      return;
    }

    setInstanceLoading(true);
    setInstanceError(null);
    try {
      const replacementInstance = await challengesApi.resetChallengeInstance(challenge.slug);
      setInstance(replacementInstance);
    } catch (err: any) {
      setInstanceError(err.message || 'Could not reset the sandbox');
    } finally {
      setInstanceLoading(false);
    }
  };

  if (!slug) return null;

  const difficultyVariant: Record<string, BadgeVariant> = {
    beginner: 'success',
    intermediate: 'warning',
    expert: 'danger',
  };

  return (
    <Modal
      isOpen={!!slug}
      onClose={onClose}
      title={challenge ? challenge.title : 'Challenge Details'}
      maxWidth="700px"
    >
      {isLoading ? (
        <LoadingSkeleton rows={4} height="50px" />
      ) : error ? (
        <ErrorState
          title="Could not load challenge"
          message={error}
          onRetry={() => loadChallenge(slug)}
        />
      ) : challenge ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Header Metadata */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              paddingBottom: '16px',
              borderBottom: '1px solid var(--color-border, #262B3F)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <Badge variant="neutral">{getCategoryName(challenge.category)}</Badge>
              <Badge variant={difficultyVariant[challenge.difficulty] || 'neutral'}>
                {challenge.difficulty}
              </Badge>
              {challenge.author && (
                <span style={{ fontSize: 'var(--text-xs, 0.75rem)', color: 'var(--color-text-muted)' }}>
                  By {challenge.author}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span
                className="font-mono"
                style={{
                  fontSize: 'var(--text-xl, 1.25rem)',
                  fontWeight: 700,
                  color: 'var(--color-brand-bright, #BA68C8)',
                }}
              >
                {challenge.points} PTS
              </span>
              <span style={{ fontSize: 'var(--text-xs, 0.75rem)', color: 'var(--color-text-muted)' }}>
                {challenge.solveCount} {challenge.solveCount === 1 ? 'solve' : 'solves'}
              </span>
            </div>
          </div>

          {/* Description */}
          <div
            style={{
              fontSize: 'var(--text-sm, 0.875rem)',
              lineHeight: 1.6,
              color: 'var(--color-text, #F8FAFC)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {challenge.description}
          </div>

          {/* Connection Info */}
          {challenge.connectionInfo && (
            <div
              style={{
                backgroundColor: 'var(--color-surface-sunken, #090B10)',
                border: '1px solid var(--color-border, #262B3F)',
                borderRadius: 'var(--radius-md, 8px)',
                padding: '12px 16px',
              }}
            >
              <span
                style={{
                  fontSize: 'var(--text-xs, 0.75rem)',
                  color: 'var(--color-text-muted, #64748B)',
                  fontWeight: 600,
                  display: 'block',
                  marginBottom: '6px',
                  textTransform: 'uppercase',
                }}
              >
                Target Connection:
              </span>
              <code
                className="font-mono"
                style={{
                  fontSize: 'var(--text-sm, 0.875rem)',
                  color: 'var(--color-brand-bright, #BA68C8)',
                  wordBreak: 'break-all',
                  display: 'block',
                }}
              >
                {challenge.connectionInfo}
              </code>
            </div>
          )}

          {isIsolatedEnclave && (
            <div
              style={{
                backgroundColor: 'var(--color-surface-sunken, #090B10)',
                border: '1px solid var(--color-border, #262B3F)',
                borderRadius: 'var(--radius-md, 8px)',
                padding: '16px',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: '8px' }}>Isolated Enclave sandbox</div>
              <p style={{ margin: '0 0 12px', color: 'var(--color-text-muted, #64748B)' }}>
                Start your team’s isolated sandbox. Your active instance is reused if you already have one.
              </p>
              <button
                type="button"
                onClick={startSandbox}
                disabled={instanceLoading}
                style={{
                  padding: '9px 14px',
                  border: '1px solid var(--color-brand, #6A1B9A)',
                  borderRadius: 'var(--radius-sm, 2px)',
                  backgroundColor: 'var(--color-brand, #6A1B9A)',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: instanceLoading ? 'wait' : 'pointer',
                  opacity: instanceLoading ? 0.7 : 1,
                }}
              >
                {instanceLoading ? 'Starting…' : instance?.status === 'RUNNING' ? 'Reconnect to sandbox' : 'Start sandbox'}
              </button>
              {instance?.status === 'RUNNING' && (
                <button
                  type="button"
                  onClick={resetSandbox}
                  disabled={instanceLoading}
                  style={{
                    marginLeft: '8px',
                    padding: '9px 14px',
                    border: '1px solid var(--color-border-light, #363D59)',
                    borderRadius: 'var(--radius-sm, 2px)',
                    backgroundColor: 'transparent',
                    color: 'var(--color-text, #F8FAFC)',
                    fontWeight: 700,
                    cursor: instanceLoading ? 'wait' : 'pointer',
                    opacity: instanceLoading ? 0.7 : 1,
                  }}
                >
                  Reset sandbox
                </button>
              )}
              {instance?.status === 'RUNNING' && (
                <div style={{ marginTop: '12px' }}>
                  <a href={instance.connectionUrl} target="_blank" rel="noreferrer">
                    Open your sandbox
                  </a>
                  <div style={{ marginTop: '4px', color: 'var(--color-text-muted, #64748B)' }}>
                    About {Math.ceil(instance.remainingTtlSeconds / 60)} minutes remaining
                  </div>
                </div>
              )}
              {instanceError && (
                <div role="alert" style={{ marginTop: '10px', color: 'var(--color-danger, #EF4444)' }}>
                  {instanceError}
                </div>
              )}
            </div>
          )}

          {/* File Downloads */}
          {challenge.files && challenge.files.length > 0 && (
            <div>
              <span
                style={{
                  fontSize: 'var(--text-xs, 0.75rem)',
                  color: 'var(--color-text-muted, #64748B)',
                  fontWeight: 600,
                  display: 'block',
                  marginBottom: '8px',
                  textTransform: 'uppercase',
                }}
              >
                Attachments:
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {challenge.files.map((file) => (
                  <a
                    key={file.id}
                    href={challengesApi.getDownloadUrl(challenge.slug, file.id)}
                    download={file.filename}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 14px',
                      minHeight: '40px',
                      backgroundColor: 'var(--color-surface-hover, #1E2336)',
                      border: '1px solid var(--color-border-light, #363D59)',
                      borderRadius: 'var(--radius-md, 8px)',
                      color: 'var(--color-text, #F8FAFC)',
                      fontSize: 'var(--text-xs, 0.75rem)',
                      textDecoration: 'none',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span>{file.filename}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Checkpoints */}
          {challenge.checkpoints && challenge.checkpoints.length > 0 && (
            <CheckpointProgress
              checkpoints={challenge.checkpoints}
              onCheckpointCompleted={(checkpointId) => {
                setChallenge((prev) => {
                  if (!prev) return null;
                  return {
                    ...prev,
                    checkpoints: prev.checkpoints.map((cp) =>
                      cp.id === checkpointId ? { ...cp, isSolved: true } : cp
                    ),
                  };
                });
                onSolve();
              }}
            />
          )}

          {/* Hints */}
          {challenge.hints && challenge.hints.length > 0 && (
            <div>
              <span
                style={{
                  fontSize: 'var(--text-xs, 0.75rem)',
                  color: 'var(--color-text-muted, #64748B)',
                  fontWeight: 600,
                  display: 'block',
                  marginBottom: '8px',
                  textTransform: 'uppercase',
                }}
              >
                Hints:
              </span>
              {challenge.hints.map((hint) => (
                <HintCard
                  key={hint.id}
                  challengeSlug={challenge.slug}
                  hint={hint}
                  onHintUnlocked={(unlocked) => {
                    const targetId = unlocked.id || (unlocked as any).hintId;
                    setChallenge((prev) => {
                      if (!prev) return null;
                      return {
                        ...prev,
                        hints: prev.hints.map((h) =>
                          h.id === targetId
                            ? { ...h, isUnlocked: true, content: unlocked.content }
                            : h
                        ),
                      };
                    });
                    onSolve();
                  }}
                />
              ))}
            </div>
          )}

          {/* Flag Submission Area */}
          <div
            style={{
              paddingTop: '16px',
              borderTop: '1px solid var(--color-border, #262B3F)',
            }}
          >
            <SubmissionForm
              challengeId={challenge.id}
              challengeSlug={challenge.slug}
              isSolved={challenge.isSolved}
              onSolveSuccess={() => {
                setChallenge((prev) => (prev ? { ...prev, isSolved: true } : null));
                onSolve();
              }}
            />
          </div>
        </div>
      ) : null}
    </Modal>
  );
};
