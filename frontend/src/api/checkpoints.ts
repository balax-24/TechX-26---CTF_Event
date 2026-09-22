import { apiClient } from './client';
import { CheckpointValidationResult } from '../types/api';

export const checkpointsApi = {
  async validateCheckpoint(
    checkpointId: string,
    proof?: string
  ): Promise<CheckpointValidationResult> {
    return apiClient.post<CheckpointValidationResult>(
      `/checkpoints/${checkpointId}/validate`,
      { proof }
    );
  },
};
