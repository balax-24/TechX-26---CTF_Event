import React, { useState, useEffect, useCallback } from 'react';
import { Challenge, Category } from '../types/api';
import { challengesApi } from '../api/challenges';
import { ChallengeCard } from '../components/challenges/ChallengeCard';
import { ChallengeModal } from '../components/challenges/ChallengeModal';
import { LoadingSkeleton, ErrorState, EmptyState } from '../components/feedback/FeedbackStates';
import { Button } from '../components/common/Button';

export const ChallengesPage: React.FC = () => {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [chalData, catData] = await Promise.all([
        challengesApi.listChallenges(),
        challengesApi.listCategories().catch(() => []),
      ]);
      setChallenges(chalData);
      setCategories(catData);
    } catch (err: any) {
      setError(err.message || 'Failed to load challenge arena.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter challenges locally by selected category and difficulty
  const filteredChallenges = challenges.filter((chal) => {
    const matchCategory =
      selectedCategory === 'all' ||
      chal.category.toLowerCase() === selectedCategory.toLowerCase();
    const matchDifficulty =
      selectedDifficulty === 'all' || chal.difficulty === selectedDifficulty;
    return matchCategory && matchDifficulty;
  });

  return (
    <div className="container" style={{ padding: '32px 16px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
        }}
      >
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl, 1.5rem)', marginBottom: '4px' }}>
            Challenge Arena
          </h1>
          <p style={{ fontSize: 'var(--text-sm, 0.875rem)' }}>
            Select a challenge to inspect details, attachments, checkpoints, and submit flags.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <select
            value={selectedDifficulty}
            onChange={(e) => setSelectedDifficulty(e.target.value)}
            style={{
              padding: '8px 12px',
              backgroundColor: 'var(--color-surface, #161926)',
              border: '1px solid var(--color-border, #262B3F)',
              borderRadius: 'var(--radius-md, 8px)',
              color: 'var(--color-text, #F8FAFC)',
              fontSize: 'var(--text-sm, 0.875rem)',
              cursor: 'pointer',
              width: 'auto',
            }}
          >
            <option value="all">All Difficulties</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="expert">Expert</option>
          </select>
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          borderBottom: '1px solid var(--color-border, #262B3F)',
          paddingBottom: '12px',
        }}
      >
        <Button
          size="sm"
          variant={selectedCategory === 'all' ? 'primary' : 'ghost'}
          onClick={() => setSelectedCategory('all')}
        >
          All Categories ({challenges.length})
        </Button>
        {categories.map((cat) => {
          const count = challenges.filter(
            (c) => c.category.toLowerCase() === cat.name.toLowerCase()
          ).length;
          return (
            <Button
              key={cat.id}
              size="sm"
              variant={selectedCategory.toLowerCase() === cat.name.toLowerCase() ? 'primary' : 'ghost'}
              onClick={() => setSelectedCategory(cat.name)}
            >
              {cat.name} ({count})
            </Button>
          );
        })}
      </div>

      {/* Challenges Grid / Feedback States */}
      {isLoading ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '20px',
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <LoadingSkeleton key={i} height="180px" rows={1} />
          ))}
        </div>
      ) : error ? (
        <ErrorState
          title="Could not load challenges"
          message={error}
          onRetry={loadData}
        />
      ) : filteredChallenges.length === 0 ? (
        <EmptyState
          title="No challenges found"
          message="No challenges currently match your active filters or release schedule."
          icon="🎯"
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '20px',
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
