import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { teamsApi } from '../api/teams';
import { Badge } from '../components/common/Badge';
import { LoadingSkeleton, ErrorState } from '../components/feedback/FeedbackStates';
import { getCategoryName } from '../utils/category';

export const TeamPage: React.FC = () => {
  const { user, team } = useAuth();
  const [teamDetails, setTeamDetails] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadTeam = useCallback(async () => {
    if (!team) {
      setTeamDetails(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await teamsApi.getMyTeam();
      if (res.success && res.team) {
        setTeamDetails(res.team);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load team roster.');
    } finally {
      setIsLoading(false);
    }
  }, [team]);

  useEffect(() => {
    loadTeam();
  }, [loadTeam]);

  if (isLoading) {
    return (
      <div className="container" style={{ padding: '24px 16px' }}>
        <LoadingSkeleton rows={4} height="60px" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container" style={{ padding: '24px 16px' }}>
        <ErrorState title="Error Loading Team Roster" message={error} onRetry={loadTeam} />
      </div>
    );
  }

  // View for participants without a team
  if (!team) {
    return (
      <div className="container" style={{ padding: '48px 16px', maxWidth: '720px' }}>
        <div
          style={{
            padding: '28px',
            backgroundColor: 'var(--color-surface, #11141D)',
            border: '1px solid #7F1D1D',
            borderRadius: 'var(--radius-sm, 2px)',
          }}
        >
          <div
            className="font-mono"
            style={{
              fontSize: '0.8125rem',
              color: '#F87171',
              fontWeight: 700,
              letterSpacing: '0.08em',
              marginBottom: '10px',
            }}
          >
            [ RESTRICTED: SQUAD NOT PROVISIONED ]
          </div>
          <h2 style={{ fontSize: '1.25rem', color: '#F8FAFC', marginBottom: '8px' }}>
            No Team Assignment Detected
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary, #94A3B8)', lineHeight: 1.6, margin: 0 }}>
            Under TechX 2026 security policies, all team creation and roster assignments are strictly provisioned by
            competition administrators. Self-service team creation and public join codes are disabled.
            Please present your participant credentials to the event operations desk for team assignment.
          </p>
        </div>
      </div>
    );
  }

  const currentDetails = teamDetails || team;

  return (
    <div className="container" style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Team Header Panel */}
      <div
        style={{
          padding: '20px 24px',
          backgroundColor: 'var(--color-surface, #11141D)',
          border: '1px solid var(--color-border, #1E2335)',
          borderLeft: '4px solid var(--color-brand, #6A1B9A)',
          borderRadius: 'var(--radius-sm, 2px)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
        }}
      >
        <div>
          <div
            className="font-mono"
            style={{
              fontSize: '0.6875rem',
              fontWeight: 700,
              color: 'var(--color-brand-bright, #BA68C8)',
              letterSpacing: '0.1em',
              marginBottom: '4px',
            }}
          >
            ASSIGNED SQUAD DOSSIER
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: '#F8FAFC' }}>
              {currentDetails.name}
            </h1>
            <Badge
              variant={
                currentDetails.status === 'ACTIVE'
                  ? 'success'
                  : currentDetails.status === 'DISQUALIFIED'
                  ? 'danger'
                  : 'warning'
              }
              size="sm"
            >
              {currentDetails.status}
            </Badge>
          </div>
          <div
            className="font-mono"
            style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #5A657D)', marginTop: '4px' }}
          >
            PROVISIONED: {new Date(currentDetails.createdAt).toLocaleDateString()}
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div
            className="font-mono"
            style={{
              fontSize: '0.6875rem',
              color: 'var(--color-text-muted, #5A657D)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            ACCUMULATED SCORE
          </div>
          <div
            className="font-mono"
            style={{
              fontSize: '1.75rem',
              fontWeight: 800,
              color: 'var(--color-brand-bright, #BA68C8)',
              marginTop: '2px',
            }}
          >
            {currentDetails.score} <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted, #5A657D)' }}>PTS</span>
          </div>
        </div>
      </div>

      {/* Team Roster & Solves Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '16px',
        }}
      >
        {/* Members Roster */}
        <div
          style={{
            backgroundColor: 'var(--color-surface, #11141D)',
            border: '1px solid var(--color-border, #1E2335)',
            borderRadius: 'var(--radius-sm, 2px)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '14px 18px',
              borderBottom: '1px solid var(--color-border, #1E2335)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span className="font-mono" style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#F8FAFC' }}>
              ROSTER MEMBERS
            </span>
            <span
              className="font-mono"
              style={{
                fontSize: '0.6875rem',
                color: 'var(--color-text-muted, #5A657D)',
              }}
            >
              {currentDetails.members?.length || 1} / 4 OPERATORS
            </span>
          </div>

          <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {currentDetails.members?.map((m: any) => (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  backgroundColor: 'var(--color-surface-sunken, #080A0F)',
                  border: '1px solid var(--color-border, #1E2335)',
                  borderRadius: '2px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#F8FAFC' }}>
                    {m.username}
                  </span>
                  {m.id === user?.id && (
                    <span
                      className="font-mono"
                      style={{
                        fontSize: '0.625rem',
                        fontWeight: 700,
                        backgroundColor: 'var(--color-brand, #6A1B9A)',
                        color: '#FFFFFF',
                        padding: '1px 5px',
                        borderRadius: '2px',
                      }}
                    >
                      YOU
                    </span>
                  )}
                </div>
                <span
                  className="font-mono"
                  style={{
                    fontSize: '0.6875rem',
                    textTransform: 'uppercase',
                    color: m.role === 'captain' ? 'var(--color-brand-bright, #BA68C8)' : 'var(--color-text-muted, #5A657D)',
                    border: '1px solid var(--color-border, #1E2335)',
                    padding: '2px 6px',
                    borderRadius: '2px',
                  }}
                >
                  {m.role}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Solved Challenges */}
        <div
          style={{
            backgroundColor: 'var(--color-surface, #11141D)',
            border: '1px solid var(--color-border, #1E2335)',
            borderRadius: 'var(--radius-sm, 2px)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '14px 18px',
              borderBottom: '1px solid var(--color-border, #1E2335)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span className="font-mono" style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#F8FAFC' }}>
              SOLVED TARGETS
            </span>
            <span
              className="font-mono"
              style={{
                fontSize: '0.6875rem',
                color: 'var(--color-text-muted, #5A657D)',
              }}
            >
              {currentDetails.solves?.length || 0} SOLVES
            </span>
          </div>

          <div style={{ padding: '12px' }}>
            {!currentDetails.solves || currentDetails.solves.length === 0 ? (
              <p
                className="font-mono"
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--color-text-muted, #5A657D)',
                  textAlign: 'center',
                  padding: '20px 0',
                  margin: 0,
                }}
              >
                NO CONFIRMED SOLVES IN LEDGER
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {currentDetails.solves.map((s: any, idx: number) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      backgroundColor: 'var(--color-surface-sunken, #080A0F)',
                      border: '1px solid var(--color-border, #1E2335)',
                      borderRadius: '2px',
                      fontSize: '0.75rem',
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600, color: '#F8FAFC' }}>
                        {s.challengeTitle || `Challenge #${s.challengeId}`}
                      </span>
                      <span
                        className="font-mono"
                        style={{ marginLeft: '8px', color: 'var(--color-text-muted, #5A657D)', fontSize: '0.6875rem' }}
                      >
                        [{getCategoryName(s.category)}]
                      </span>
                    </div>
                    <span
                      className="font-mono"
                      style={{ fontWeight: 700, color: 'var(--color-success, #10B981)' }}
                    >
                      +{s.points} PTS
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
