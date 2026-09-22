import React, { useState, useEffect } from 'react';
import { ChallengeDetail } from '../../types/api';
import { challengesApi } from '../../api/challenges';
import { Modal } from '../common/Modal';
import { Badge, BadgeVariant } from '../common/Badge';
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Badge variant="neutral">{challenge.category}</Badge>
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
                }}
              >
                {challenge.connectionInfo}
              </code>
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
                      padding: '6px 12px',
                      backgroundColor: 'var(--color-surface-hover, #1E2336)',
                      border: '1px solid var(--color-border-light, #363D59)',
                      borderRadius: 'var(--radius-md, 8px)',
                      color: 'var(--color-text, #F8FAFC)',
                      fontSize: 'var(--text-xs, 0.75rem)',
                      textDecoration: 'none',
                    }}
                  >
                    <span>📥</span>
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
                    setChallenge((prev) => {
                      if (!prev) return null;
                      return {
                        ...prev,
                        hints: prev.hints.map((h) =>
                          h.id === unlocked.id
                            ? { ...h, isUnlocked: true, content: unlocked.content }
                            : h
                        ),
                      };
                    });
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
