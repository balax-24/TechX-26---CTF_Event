import { apiClient } from './client';
import { CompetitionInfo } from '../types/api';

export const competitionApi = {
  async getState(): Promise<CompetitionInfo> {
    const res = await apiClient.get<{ success: boolean; competition: CompetitionInfo }>(
      '/competition/state'
    );
    return res.competition;
  },
};
