import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CheckpointProgress } from '../../src/components/challenges/CheckpointProgress';
import { HintCard } from '../../src/components/challenges/HintCard';
import { ToastProvider } from '../../src/contexts/ToastContext';
import { AuthProvider } from '../../src/contexts/AuthContext';
import { CompetitionProvider } from '../../src/contexts/CompetitionContext';
import { checkpointsApi } from '../../src/api/checkpoints';
import { challengesApi } from '../../src/api/challenges';

vi.mock('../../src/api/checkpoints', () => ({
  checkpointsApi: {
    validateCheckpoint: vi.fn(),
  },
}));

vi.mock('../../src/api/challenges', () => ({
  challengesApi: {
    unlockHint: vi.fn(),
  },
}));

vi.mock('../../src/api/competition', () => ({
  competitionApi: {
    getState: vi.fn().mockResolvedValue({
      name: 'TechX CTF 2026',
      state: 'live',
      isSubmissionEnabled: true,
      timezone: 'Asia/Kolkata',
    }),
  },
}));

describe('Checkpoints & Hints Interactivity', () => {
  it('renders sequential checkpoints and respects prerequisite locks', async () => {
    const checkpoints = [
      {
        id: 'cp-1',
        stepNumber: 1,
        title: 'Bypass Auth Filter',
        description: 'Extract JWT token',
        points: 50,
        isSolved: true,
      },
      {
        id: 'cp-2',
        stepNumber: 2,
        title: 'Escalate to Admin',
        description: 'Generate forged signature',
        points: 75,
        isSolved: false,
      },
      {
        id: 'cp-3',
        stepNumber: 3,
        title: 'Read Root Secret',
        description: 'Access flag file',
        points: 100,
        isSolved: false,
      },
    ];

    render(
      <ToastProvider>
        <AuthProvider>
          <CompetitionProvider>
            <CheckpointProgress checkpoints={checkpoints} onCheckpointCompleted={() => {}} />
          </CompetitionProvider>
        </AuthProvider>
      </ToastProvider>
    );

    // Step 1 is solved (✓)
    expect(await screen.findByText('Step 1: Bypass Auth Filter')).toBeInTheDocument();
    expect(screen.getByText('✓')).toBeInTheDocument();

    // Step 2 is available with input
    expect(screen.getByText('Step 2: Escalate to Admin')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter checkpoint proof / token...')).toBeInTheDocument();

    // Step 3 is locked (🔒)
    expect(screen.getByText('Step 3: Read Root Secret')).toBeInTheDocument();
    expect(screen.getByText('🔒')).toBeInTheDocument();
  });

  it('submits checkpoint proof and calls completion callback', async () => {
    vi.mocked(checkpointsApi.validateCheckpoint).mockResolvedValueOnce({
      success: true,
      status: 'passed',
      pointsAwarded: 75,
      newScore: 400,
    });

    const onCompleted = vi.fn();
    const checkpoints = [
      {
        id: 'cp-1',
        stepNumber: 1,
        title: 'Bypass Auth Filter',
        description: 'Extract JWT token',
        points: 75,
        isSolved: false,
      },
    ];

    render(
      <ToastProvider>
        <AuthProvider>
          <CompetitionProvider>
            <CheckpointProgress checkpoints={checkpoints} onCheckpointCompleted={onCompleted} />
          </CompetitionProvider>
        </AuthProvider>
      </ToastProvider>
    );

    const input = screen.getByPlaceholderText('Enter checkpoint proof / token...');
    fireEvent.change(input, { target: { value: 'jwt_proof_token_abc' } });
    fireEvent.click(screen.getByRole('button', { name: /validate/i }));

    await waitFor(() => {
      expect(checkpointsApi.validateCheckpoint).toHaveBeenCalledWith('cp-1', 'jwt_proof_token_abc');
    });
    expect(onCompleted).toHaveBeenCalledWith('cp-1', 400);
  });

  it('requires confirmation before unlocking hints and displays penalty', async () => {
    vi.mocked(challengesApi.unlockHint).mockResolvedValueOnce({
      id: 'h-1',
      content: 'Examine the Authorization header.',
      penaltyPoints: 25,
    });

    const onUnlocked = vi.fn();

    render(
      <ToastProvider>
        <AuthProvider>
          <CompetitionProvider>
            <HintCard
              challengeSlug="web-101"
              hint={{
                id: 'h-1',
                hintNumber: 1,
                penaltyPoints: 25,
                isUnlocked: false,
                content: null,
              }}
              onHintUnlocked={onUnlocked}
            />
          </CompetitionProvider>
        </AuthProvider>
      </ToastProvider>
    );

    // Shows penalty
    expect(screen.getByText(/(Penalty: -25 pts)/i)).toBeInTheDocument();

    // Click Unlock Hint -> shows Confirm button
    fireEvent.click(screen.getByRole('button', { name: /unlock hint/i }));
    const confirmBtn = screen.getByRole('button', { name: /confirm \(-25\)/i });
    expect(confirmBtn).toBeInTheDocument();

    // Click Confirm
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(challengesApi.unlockHint).toHaveBeenCalledWith('web-101', 'h-1');
    });
    expect(onUnlocked).toHaveBeenCalledWith({
      id: 'h-1',
      content: 'Examine the Authorization header.',
      penaltyPoints: 25,
    });
  });
});
