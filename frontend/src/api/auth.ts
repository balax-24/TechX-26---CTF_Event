import { apiClient, setCachedCsrfToken } from './client';
import { User, Team } from '../types/api';

export interface AuthResponse {
  success: boolean;
  user: User;
  team: Team | null;
  token?: string;
  csrfToken?: string;
  message?: string;
}

export const authApi = {
  async login(data: { emailOrUsername: string; password: string }): Promise<AuthResponse> {
    const res = await apiClient.post<AuthResponse>('/auth/login', {
      identifier: data.emailOrUsername,
      emailOrUsername: data.emailOrUsername,
      password: data.password,
    });
    if (res.csrfToken) {
      setCachedCsrfToken(res.csrfToken);
    }
    return res;
  },

  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout');
    } finally {
      setCachedCsrfToken(null);
    }
  },

  async getProfile(): Promise<{ success: boolean; user: User; team: Team | null }> {
    return apiClient.get('/auth/me');
  },

  async getCsrf(): Promise<string | null> {
    const res = await apiClient.get<{ csrfToken: string }>('/auth/csrf');
    if (res?.csrfToken) {
      setCachedCsrfToken(res.csrfToken);
      return res.csrfToken;
    }
    return null;
  },
};
