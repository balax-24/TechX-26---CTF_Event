import { apiClient } from './client';
import { FlagSubmissionResult } from '../types/api';

export const submissionsApi = {
  async submitFlag(challengeId: string, flag: string): Promise<FlagSubmissionResult> {
    return apiClient.post<FlagSubmissionResult>('/submissions/flag', {
      challengeId,
      flag,
    });
  },
};
