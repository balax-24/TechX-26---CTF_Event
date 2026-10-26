import { apiClient } from './client';
import { Team } from '../types/api';

export const teamsApi = {
  async getMyTeam(): Promise<{ success: boolean; team: Team }> {
    return apiClient.get('/teams/me');
  },

  async getTeamById(id: string): Promise<{ success: boolean; team: Team }> {
    return apiClient.get(`/teams/${id}`);
  },
};
