import { apiClient } from './client';
import { Challenge, ChallengeDetail, ChallengeInstance, Category } from '../types/api';

export const challengesApi = {
  async listChallenges(category?: string, difficulty?: string): Promise<Challenge[]> {
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    if (difficulty) params.append('difficulty', difficulty);

    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await apiClient.get<{ success: boolean; challenges: Challenge[] }>(
      `/challenges${query}`
    );
    return res.challenges;
  },

  async getChallengeBySlug(slug: string): Promise<ChallengeDetail> {
    const res = await apiClient.get<{ success: boolean; challenge: ChallengeDetail }>(
      `/challenges/${slug}`
    );
    return res.challenge;
  },

  async getChallengeInstance(slug: string): Promise<ChallengeInstance | null> {
    const res = await apiClient.get<{
      success: boolean;
      instance: ChallengeInstance | null;
    }>(`/challenges/${slug}/instance`);
    return res.instance;
  },

  async startChallengeInstance(slug: string): Promise<ChallengeInstance> {
    const res = await apiClient.post<{
      success: boolean;
      instance: ChallengeInstance;
    }>(`/challenges/${slug}/instance`);
    return res.instance;
  },

  async resetChallengeInstance(slug: string): Promise<ChallengeInstance> {
    const res = await apiClient.post<{
      success: boolean;
      instance: ChallengeInstance;
    }>(`/challenges/${slug}/instance/reset`);
    return res.instance;
  },

  async listCategories(): Promise<Category[]> {
    const res = await apiClient.get<{ success: boolean; categories: Category[] }>(
      '/categories'
    );
    return res.categories;
  },

  async unlockHint(
    slug: string,
    hintId: string
  ): Promise<{ id: string; hintId?: string; content: string; penaltyPoints: number; newTeamScore?: number }> {
    const res = await apiClient.post<{
      success: boolean;
      hint: { id: string; hintId?: string; content: string; penaltyPoints: number; newTeamScore?: number };
    }>(`/challenges/${slug}/hints/${hintId}/unlock`);
    return res.hint;
  },

  getDownloadUrl(slug: string, fileId: string): string {
    const base = import.meta.env.VITE_API_BASE_URL || '/api/v1';
    return `${base}/challenges/${slug}/files/${fileId}`;
  },
};
