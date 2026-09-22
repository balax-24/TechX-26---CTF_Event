import { apiClient } from './client';
import { Team } from '../types/api';

export interface CreateTeamResponse {
  success: boolean;
  team: Team;
  inviteCode: string;
  token?: string;
}

export interface JoinTeamResponse {
  success: boolean;
  team: Team;
  token?: string;
}

export const teamsApi = {
  async createTeam(name: string): Promise<CreateTeamResponse> {
    return apiClient.post<CreateTeamResponse>('/teams', { name });
  },

  async joinTeam(inviteCode: string): Promise<JoinTeamResponse> {
    return apiClient.post<JoinTeamResponse>('/teams/join', { inviteCode });
  },

  async getMyTeam(): Promise<{ success: boolean; team: Team }> {
    return apiClient.get('/teams/me');
  },

  async getTeamById(id: string): Promise<{ success: boolean; team: Team }> {
    return apiClient.get(`/teams/${id}`);
  },

  async leaveTeam(): Promise<{ success: boolean; disbanded: boolean; message: string }> {
    return apiClient.post('/teams/leave');
  },
};
