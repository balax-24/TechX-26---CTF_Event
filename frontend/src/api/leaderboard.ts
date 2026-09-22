import { apiClient } from './client';
import { LeaderboardSnapshot } from '../types/api';

export const leaderboardApi = {
  async getSnapshot(): Promise<LeaderboardSnapshot> {
    return apiClient.get<LeaderboardSnapshot>('/leaderboard');
  },

  getStreamUrl(): string {
    const base = import.meta.env.VITE_API_BASE_URL || '/api/v1';
    return `${base}/leaderboard/stream`;
  },
};
