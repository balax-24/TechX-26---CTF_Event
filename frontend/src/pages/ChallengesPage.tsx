import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Challenge } from '../types/api';
import { challengesApi } from '../api/challenges';
import { ChallengeCard } from '../components/challenges/ChallengeCard';
import { ChallengeModal } from '../components/challenges/ChallengeModal';
import { LoadingSkeleton, ErrorState } from '../components/feedback/FeedbackStates';
import { getCategoryName, getCategorySlug, matchesCategory } from '../utils/category';

const STANDARD_CATEGORIES = ['ALL', 'WEB', 'CRYPTO', 'FORENSICS', 'REVERSE', 'PWN', 'OSINT'];

export const ChallengesPage: React.FC = () => {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const chalData = await challengesApi.listChallenges();
      setChallenges(chalData);
    } catch (err: any) {
      setError(err.message || 'Failed to load challenge arena.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Dynamic categories combined with standard CTF categories
  const categoriesList = useMemo(() => {
    const list: string[] = ['ALL'];
    const seen = new Set<string>(['ALL']);

    STANDARD_CATEGORIES.forEach((cat) => {
      if (!seen.has(cat)) {
        list.push(cat);
        seen.add(cat);
      }
    });

    challenges.forEach((c) => {
      const slug = getCategorySlug(c.category).toUpperCase();
      const name = getCategoryName(c.category).toUpperCase();
      const hasMatch = STANDARD_CATEGORIES.some((std) => matchesCategory(c.category, std));
      if (!hasMatch) {
        const key = slug || name;
        if (key && !seen.has(key)) {
          list.push(key);
          seen.add(key);
        }
      }
    });

    return list;
  }, [challenges]);

  // Filter challenges locally
  const filteredChallenges = useMemo(() => {
    return challenges.filter((chal) => {
      const matchCategory = matchesCategory(chal.category, selectedCategory);
      const matchDifficulty =
        selectedDifficulty === 'all' || chal.difficulty === selectedDifficulty;
      const matchSearch =
        !searchQuery.trim() ||
        chal.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        getCategoryName(chal.category).toLowerCase().includes(searchQuery.toLowerCase()) ||
        getCategorySlug(chal.category).toLowerCase().includes(searchQuery.toLowerCase());
      return matchCategory && matchDifficulty && matchSearch;
    });
  }, [challenges, selectedCategory, selectedDifficulty, searchQuery]);

  const totalPoints = useMemo(() => {
    return challenges.reduce((sum, c) => sum + c.points, 0);
  }, [challenges]);

  const solvedCount = useMemo(() => {
    return challenges.filter((c) => c.isSolved).length;
  }, [challenges]);

  return (
    <div className="container" style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          paddingBottom: '16px',
          borderBottom: '1px solid var(--color-border, #1E2335)',
        }}
      >
        <div>
          <div
            className="font-mono"
            style={{
              fontSize: '0.6875rem',
              fontWeight: 700,
              color: 'var(--color-brand-bright, #BA68C8)',
              letterSpacing: '0.12em',
              marginBottom: '4px',
            }}
          >
            OPERATIONAL TARGETS
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: '#F8FAFC' }}>
            CHALLENGES
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div
            className="font-mono"
            style={{
              padding: '6px 12px',
              backgroundColor: 'var(--color-surface, #11141D)',
              border: '1px solid var(--color-border, #1E2335)',
              borderRadius: '2px',
              fontSize: '0.75rem',
              color: 'var(--color-text-secondary, #94A3B8)',
            }}
          >
            TARGETS: <strong style={{ color: '#F8FAFC' }}>{challenges.length}</strong> &bull; TOTAL:{' '}
            <strong style={{ color: 'var(--color-brand-bright, #BA68C8)' }}>{totalPoints} PTS</strong> &bull; SOLVED:{' '}
            <strong style={{ color: 'var(--color-success, #10B981)' }}>{solvedCount}</strong>
          </div>

          <input
            type="text"
            placeholder="Search targets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="font-mono"
            style={{
              padding: '6px 12px',
              backgroundColor: 'var(--color-surface, #11141D)',
              border: '1px solid var(--color-border, #1E2335)',
              borderRadius: '2px',
              color: '#F8FAFC',
              fontSize: '0.75rem',
              width: '180px',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Part 12 Category Filter Strip */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {categoriesList.map((cat) => {
            const count =
              cat === 'ALL'
                ? challenges.length
                : challenges.filter((c) => matchesCategory(c.category, cat)).length;
            const isSelected = selectedCategory === cat;

            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className="font-mono"
                style={{
                  padding: '6px 12px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  backgroundColor: isSelected ? 'var(--color-brand, #6A1B9A)' : 'var(--color-surface, #11141D)',
                  color: isSelected ? '#FFFFFF' : 'var(--color-text-secondary, #94A3B8)',
                  border: `1px solid ${isSelected ? 'var(--color-brand-bright, #BA68C8)' : 'var(--color-border, #1E2335)'}`,
                  borderRadius: '2px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  letterSpacing: '0.04em',
                }}
              >
                {cat} {count > 0 && <span style={{ opacity: 0.6 }}>({count})</span>}
              </button>
            );
          })}
        </div>

        <div>
          <select
            value={selectedDifficulty}
            onChange={(e) => setSelectedDifficulty(e.target.value)}
            className="font-mono"
            style={{
              padding: '6px 10px',
              backgroundColor: 'var(--color-surface, #11141D)',
              border: '1px solid var(--color-border, #1E2335)',
              borderRadius: '2px',
              color: '#F8FAFC',
              fontSize: '0.75rem',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="all">ALL DIFFICULTIES</option>
            <option value="beginner">BEGINNER</option>
            <option value="intermediate">INTERMEDIATE</option>
            <option value="expert">EXPERT</option>
          </select>
        </div>
      </div>

      {/* Challenges Scan-Friendly Grid */}
      {isLoading ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: '12px',
          }}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <LoadingSkeleton key={i} height="140px" rows={1} />
          ))}
        </div>
      ) : error ? (
        <ErrorState title="Failed to load challenge arena" message={error} onRetry={loadData} />
      ) : filteredChallenges.length === 0 ? (
        <div
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            backgroundColor: 'var(--color-surface, #11141D)',
            border: '1px dashed var(--color-border, #1E2335)',
            borderRadius: '2px',
          }}
        >
          <p className="font-mono" style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted, #5A657D)', margin: 0 }}>
            NO CHALLENGES MATCH SPECIFIED FILTERS
          </p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: '12px',
          }}
        >
          {filteredChallenges.map((chal) => (
            <ChallengeCard
              key={chal.id}
              challenge={chal}
              onClick={() => setActiveSlug(chal.slug)}
            />
          ))}
        </div>
      )}

      {/* Challenge Detail & Submission Modal */}
      <ChallengeModal
        slug={activeSlug}
        onClose={() => setActiveSlug(null)}
        onSolve={() => {
          loadData();
        }}
      />
    </div>
  );
};
