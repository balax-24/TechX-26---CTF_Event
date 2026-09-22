import { apiClient } from './client';
import { Challenge, ChallengeDetail, Category } from '../types/api';

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

  async listCategories(): Promise<Category[]> {
    const res = await apiClient.get<{ success: boolean; categories: Category[] }>(
      '/categories'
    );
    return res.categories;
  },

  async unlockHint(slug: string, hintId: string): Promise<{ id: string; content: string; penaltyPoints: number }> {
    const res = await apiClient.post<{
      success: boolean;
      hint: { id: string; content: string; penaltyPoints: number };
    }>(`/challenges/${slug}/hints/${hintId}/unlock`);
    return res.hint;
  },

  getDownloadUrl(slug: string, fileId: string): string {
    const base = import.meta.env.VITE_API_BASE_URL || '/api/v1';
    return `${base}/challenges/${slug}/files/${fileId}`;
  },
};
