import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCompetition } from '../contexts/CompetitionContext';
import { useLeaderboard } from '../contexts/LeaderboardContext';
import { challengesApi } from '../api/challenges';
import { Challenge } from '../types/api';
import { getCategoryName } from '../utils/category';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Countdown } from '../components/common/Countdown';
import { ChallengeModal } from '../components/challenges/ChallengeModal';
import { LoadingSkeleton, ErrorState } from '../components/feedback/FeedbackStates';

export const DashboardPage: React.FC = () => {
  const { user, team } = useAuth();
  const { state, isLive, isPaused, isEnded } = useCompetition();
  const { entries } = useLeaderboard();

  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'unsolved' | 'solved'>('all');

  const loadChallenges = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await challengesApi.listChallenges();
      setChallenges(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load challenge matrix.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChallenges();
  }, [loadChallenges]);

  // Compute team rank from authoritative leaderboard entries
  const currentRank = useMemo(() => {
    if (!team) return null;
    const match = entries.find((e) => e.teamId === team.id);
    return match ? match.rank : null;
  }, [entries, team]);

  const solvedCount = useMemo(() => {
    return challenges.filter((c) => c.isSolved).length;
  }, [challenges]);

  const progressPercent = useMemo(() => {
    if (challenges.length === 0) return 0;
    return Math.round((solvedCount / challenges.length) * 100);
  }, [challenges.length, solvedCount]);

  const filteredChallenges = useMemo(() => {
    if (filterTab === 'solved') return challenges.filter((c) => c.isSolved);
    if (filterTab === 'unsolved') return challenges.filter((c) => !c.isSolved);
    return challenges;
  }, [challenges, filterTab]);

  const getStatusBadge = () => {
    if (isPaused) return <Badge variant="warning">PAUSED</Badge>;
    if (isEnded) return <Badge variant="danger">ENDED</Badge>;
    if (isLive) return <Badge variant="success">LIVE</Badge>;
    return <Badge variant="neutral">{state.toUpperCase()}</Badge>;
  };

  return (
    <div className="container" style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Console Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          padding: '14px 18px',
          backgroundColor: 'var(--color-surface, #11141D)',
          border: '1px solid var(--color-border, #1E2335)',
          borderRadius: 'var(--radius-sm, 2px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <span
            className="font-mono"
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.12em',
              color: 'var(--color-brand-bright, #BA68C8)',
            }}
          >
            TECHX // CTF OPERATIONAL CONSOLE
          </span>
          <div style={{ height: '14px', width: '1px', backgroundColor: 'var(--color-border, #1E2335)' }} />
          {getStatusBadge()}
          <span
            className="font-mono"
            style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary, #94A3B8)' }}
          >
            OPERATOR: <strong style={{ color: '#F8FAFC' }}>{user?.username}</strong>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Countdown />
        </div>
      </div>

      {/* Part 11: Top Team Status Strip (TEAM NAME, TEAM RANK, TEAM SCORE) */}
      {team ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '12px',
          }}
        >
          <div
            style={{
              padding: '16px 20px',
              backgroundColor: 'var(--color-surface, #11141D)',
              border: '1px solid var(--color-border, #1E2335)',
              borderLeft: '3px solid var(--color-brand, #6A1B9A)',
              borderRadius: 'var(--radius-sm, 2px)',
            }}
          >
            <div
              className="font-mono"
              style={{
                fontSize: '0.6875rem',
                color: 'var(--color-text-muted, #5A657D)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '6px',
              }}
            >
              TEAM NAME
            </div>
            <div
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: '#F8FAFC',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>{team.name}</span>
              <Badge variant={team.status === 'ACTIVE' ? 'success' : 'danger'} size="sm">
                {team.status}
              </Badge>
            </div>
          </div>

          <div
            style={{
              padding: '16px 20px',
              backgroundColor: 'var(--color-surface, #11141D)',
              border: '1px solid var(--color-border, #1E2335)',
              borderRadius: 'var(--radius-sm, 2px)',
            }}
          >
            <div
              className="font-mono"
              style={{
                fontSize: '0.6875rem',
                color: 'var(--color-text-muted, #5A657D)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '6px',
              }}
            >
              TEAM RANK
            </div>
            <div
              className="font-mono"
              style={{
                fontSize: '1.5rem',
                fontWeight: 800,
                color: currentRank === 1 ? '#FBBF24' : currentRank ? '#F8FAFC' : 'var(--color-text-muted, #5A657D)',
              }}
            >
              {currentRank ? `#${String(currentRank).padStart(2, '0')}` : 'UNRANKED'}
            </div>
          </div>

          <div
            style={{
              padding: '16px 20px',
              backgroundColor: 'var(--color-surface, #11141D)',
              border: '1px solid var(--color-border, #1E2335)',
              borderRadius: 'var(--radius-sm, 2px)',
            }}
          >
            <div
              className="font-mono"
              style={{
                fontSize: '0.6875rem',
                color: 'var(--color-text-muted, #5A657D)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '6px',
              }}
            >
              TEAM SCORE
            </div>
            <div
              className="font-mono"
              style={{
                fontSize: '1.5rem',
                fontWeight: 800,
                color: 'var(--color-brand-bright, #BA68C8)',
              }}
            >
              {team.score} <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #5A657D)', fontWeight: 500 }}>PTS</span>
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{
            padding: '24px',
            backgroundColor: 'var(--color-surface, #11141D)',
            border: '1px solid #7F1D1D',
            borderRadius: 'var(--radius-sm, 2px)',
          }}
        >
          <div
            className="font-mono"
            style={{
              fontSize: '0.75rem',
              color: '#F87171',
              fontWeight: 700,
              letterSpacing: '0.08em',
              marginBottom: '8px',
            }}
          >
            [ ACCESS RESTRICTED: SQUAD NOT PROVISIONED ]
          </div>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary, #94A3B8)', margin: 0 }}>
            This account is authenticated under participant RBAC, but has no team binding in the authoritative database.
            Contact the TechX competition administrator for team assignment.
          </p>
        </div>
      )}

      {/* Part 11: Secondary Status Row (ACTIVE CHALLENGES, SOLVED, PROGRESS) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
        }}
      >
        <div
          style={{
            padding: '14px 18px',
            backgroundColor: 'var(--color-surface-sunken, #080A0F)',
            border: '1px solid var(--color-border, #1E2335)',
            borderRadius: 'var(--radius-sm, 2px)',
          }}
        >
          <div
            className="font-mono"
            style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted, #5A657D)', textTransform: 'uppercase' }}
          >
            ACTIVE CHALLENGES
          </div>
          <div
            className="font-mono"
            style={{ fontSize: '1.25rem', fontWeight: 700, color: '#F8FAFC', marginTop: '4px' }}
          >
            {challenges.length}
          </div>
        </div>

        <div
          style={{
            padding: '14px 18px',
            backgroundColor: 'var(--color-surface-sunken, #080A0F)',
            border: '1px solid var(--color-border, #1E2335)',
            borderRadius: 'var(--radius-sm, 2px)',
          }}
        >
          <div
            className="font-mono"
            style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted, #5A657D)', textTransform: 'uppercase' }}
          >
            SOLVED
          </div>
          <div
            className="font-mono"
            style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-success, #10B981)', marginTop: '4px' }}
          >
            {solvedCount} / {challenges.length}
          </div>
        </div>

        <div
          style={{
            padding: '14px 18px',
            backgroundColor: 'var(--color-surface-sunken, #080A0F)',
            border: '1px solid var(--color-border, #1E2335)',
            borderRadius: 'var(--radius-sm, 2px)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '6px',
            }}
          >
            <span
              className="font-mono"
              style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted, #5A657D)', textTransform: 'uppercase' }}
            >
              PROGRESS
            </span>
            <span className="font-mono" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#F8FAFC' }}>
              {progressPercent}%
            </span>
          </div>
          <div
            style={{
              width: '100%',
              height: '6px',
              backgroundColor: 'var(--color-surface, #11141D)',
              borderRadius: '2px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progressPercent}%`,
                height: '100%',
                backgroundColor: 'var(--color-brand, #6A1B9A)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      </div>

      {/* Part 11: Challenge Activity Table (Challenge, Category, Difficulty, Points, Status) */}
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
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="font-mono" style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#F8FAFC' }}>
              CHALLENGE ACTIVITY & TARGETS
            </span>
            <span
              className="font-mono"
              style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted, #5A657D)' }}
            >
              ({filteredChallenges.length} ITEMS)
            </span>
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => setFilterTab('all')}
              style={{
                padding: '4px 10px',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono)',
                backgroundColor: filterTab === 'all' ? 'var(--color-brand, #6A1B9A)' : 'transparent',
                color: filterTab === 'all' ? '#FFFFFF' : 'var(--color-text-secondary, #94A3B8)',
                border: '1px solid var(--color-border, #1E2335)',
                borderRadius: '2px',
                cursor: 'pointer',
              }}
            >
              ALL
            </button>
            <button
              onClick={() => setFilterTab('unsolved')}
              style={{
                padding: '4px 10px',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono)',
                backgroundColor: filterTab === 'unsolved' ? 'var(--color-brand, #6A1B9A)' : 'transparent',
                color: filterTab === 'unsolved' ? '#FFFFFF' : 'var(--color-text-secondary, #94A3B8)',
                border: '1px solid var(--color-border, #1E2335)',
                borderRadius: '2px',
                cursor: 'pointer',
              }}
            >
              UNSOLVED ({challenges.length - solvedCount})
            </button>
            <button
              onClick={() => setFilterTab('solved')}
              style={{
                padding: '4px 10px',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono)',
                backgroundColor: filterTab === 'solved' ? 'var(--color-brand, #6A1B9A)' : 'transparent',
                color: filterTab === 'solved' ? '#FFFFFF' : 'var(--color-text-secondary, #94A3B8)',
                border: '1px solid var(--color-border, #1E2335)',
                borderRadius: '2px',
                cursor: 'pointer',
              }}
            >
              SOLVED ({solvedCount})
            </button>
          </div>
        </div>

        {isLoading ? (
          <div style={{ padding: '20px' }}>
            <LoadingSkeleton rows={5} height="44px" />
          </div>
        ) : error ? (
          <div style={{ padding: '20px' }}>
            <ErrorState title="Failed to load targets" message={error} onRetry={loadChallenges} />
          </div>
        ) : filteredChallenges.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center' }}>
            <p className="font-mono" style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted, #5A657D)', margin: 0 }}>
              NO TARGETS MATCH ACTIVE FILTER
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
                fontSize: '0.8125rem',
              }}
            >
              <thead>
                <tr
                  className="font-mono"
                  style={{
                    borderBottom: '1px solid var(--color-border, #1E2335)',
                    backgroundColor: 'var(--color-surface-sunken, #080A0F)',
                    color: 'var(--color-text-muted, #5A657D)',
                    fontSize: '0.6875rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  <th style={{ padding: '10px 16px' }}>CHALLENGE</th>
                  <th style={{ padding: '10px 16px' }}>CATEGORY</th>
                  <th style={{ padding: '10px 16px' }}>DIFFICULTY</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right' }}>POINTS</th>
                  <th style={{ padding: '10px 16px', textAlign: 'center' }}>STATUS</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right' }}>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {filteredChallenges.map((chal) => (
                  <tr
                    key={chal.id}
                    style={{
                      borderBottom: '1px solid var(--color-border, #1E2335)',
                      backgroundColor: chal.isSolved ? 'rgba(16, 185, 129, 0.04)' : 'transparent',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontWeight: 600, color: chal.isSolved ? '#10B981' : '#F8FAFC' }}>
                        {chal.title}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        className="font-mono"
                        style={{
                          fontSize: '0.6875rem',
                          padding: '2px 6px',
                          border: '1px solid var(--color-border, #1E2335)',
                          borderRadius: '2px',
                          color: 'var(--color-text-secondary, #94A3B8)',
                        }}
                      >
                        {getCategoryName(chal.category)}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        className="font-mono"
                        style={{
                          fontSize: '0.6875rem',
                          textTransform: 'uppercase',
                          color:
                            chal.difficulty === 'beginner'
                              ? 'var(--color-success, #10B981)'
                              : chal.difficulty === 'intermediate'
                              ? 'var(--color-warning, #F59E0B)'
                              : 'var(--color-danger, #EF4444)',
                        }}
                      >
                        {chal.difficulty}
                      </span>
                    </td>
                    <td
                      className="font-mono"
                      style={{
                        padding: '12px 16px',
                        textAlign: 'right',
                        fontWeight: 700,
                        color: 'var(--color-brand-bright, #BA68C8)',
                      }}
                    >
                      {chal.points} PTS
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      {chal.isSolved ? (
                        <span
                          className="font-mono"
                          style={{
                            fontSize: '0.6875rem',
                            fontWeight: 700,
                            color: '#10B981',
                            padding: '2px 6px',
                            backgroundColor: 'rgba(16, 185, 129, 0.12)',
                            borderRadius: '2px',
                          }}
                        >
                          SOLVED
                        </span>
                      ) : (
                        <span
                          className="font-mono"
                          style={{
                            fontSize: '0.6875rem',
                            color: 'var(--color-text-muted, #5A657D)',
                            padding: '2px 6px',
                            backgroundColor: 'rgba(90, 101, 125, 0.1)',
                            borderRadius: '2px',
                          }}
                        >
                          UNSOLVED
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <Button
                        size="sm"
                        variant={chal.isSolved ? 'outline' : 'primary'}
                        onClick={() => setActiveSlug(chal.slug)}
                        style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                      >
                        {chal.isSolved ? 'INSPECT' : 'ENGAGE'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Navigation Footer */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '12px',
        }}
      >
        <Link
          to="/challenges"
          style={{
            textDecoration: 'none',
            padding: '16px 20px',
            backgroundColor: 'var(--color-surface, #11141D)',
            border: '1px solid var(--color-border, #1E2335)',
            borderRadius: 'var(--radius-sm, 2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div className="font-mono" style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#F8FAFC' }}>
              CHALLENGE MATRIX
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #5A657D)', marginTop: '2px' }}>
              Full operational challenge list and category breakdown
            </div>
          </div>
          <span className="font-mono" style={{ color: 'var(--color-brand-bright, #BA68C8)', fontSize: '0.875rem' }}>
            &rarr;
          </span>
        </Link>

        <Link
          to="/leaderboard"
          style={{
            textDecoration: 'none',
            padding: '16px 20px',
            backgroundColor: 'var(--color-surface, #11141D)',
            border: '1px solid var(--color-border, #1E2335)',
            borderRadius: 'var(--radius-sm, 2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div className="font-mono" style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#F8FAFC' }}>
              LIVE LEADERBOARD
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #5A657D)', marginTop: '2px' }}>
              Real-time standings synchronized with monotonic score ledger
            </div>
          </div>
          <span className="font-mono" style={{ color: 'var(--color-brand-bright, #BA68C8)', fontSize: '0.875rem' }}>
            &rarr;
          </span>
        </Link>
      </div>

      {/* Challenge Engagement Modal */}
      <ChallengeModal
        slug={activeSlug}
        onClose={() => setActiveSlug(null)}
        onSolve={() => {
          loadChallenges();
        }}
      />
    </div>
  );
};
