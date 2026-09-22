import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { CompetitionInfo, CompetitionState } from '../types/api';
import { competitionApi } from '../api/competition';

interface CompetitionContextType {
  competition: CompetitionInfo | null;
  state: CompetitionState;
  isLive: boolean;
  isPaused: boolean;
  isEnded: boolean;
  isRegistrationOpen: boolean;
  isLoading: boolean;
  refreshState: () => Promise<void>;
}

const CompetitionContext = createContext<CompetitionContextType | undefined>(undefined);

export const CompetitionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [competition, setCompetition] = useState<CompetitionInfo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshState = useCallback(async () => {
    try {
      const comp = await competitionApi.getState();
      setCompetition(comp);
    } catch {
      // Keep previous state or fallback
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshState();

    // Re-check competition state every 60 seconds
    const interval = setInterval(() => {
      refreshState();
    }, 60000);

    return () => clearInterval(interval);
  }, [refreshState]);

  const state: CompetitionState = competition?.state || 'live';
  const isLive = state === 'live';
  const isPaused = state === 'paused';
  const isEnded = state === 'ended' || state === 'archived';
  const isRegistrationOpen = state === 'registration_open' || state === 'live';

  return (
    <CompetitionContext.Provider
      value={{
        competition,
        state,
        isLive,
        isPaused,
        isEnded,
        isRegistrationOpen,
        isLoading,
        refreshState,
      }}
    >
      {children}
    </CompetitionContext.Provider>
  );
};

export const useCompetition = (): CompetitionContextType => {
  const context = useContext(CompetitionContext);
  if (!context) {
    throw new Error('useCompetition must be used within a CompetitionProvider');
  }
  return context;
};
