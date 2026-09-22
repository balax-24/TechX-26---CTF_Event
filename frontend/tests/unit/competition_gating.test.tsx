import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBanner } from '../../src/components/common/StatusBanner';
import { SubmissionForm } from '../../src/components/challenges/SubmissionForm';
import { CompetitionProvider } from '../../src/contexts/CompetitionContext';
import { AuthProvider } from '../../src/contexts/AuthContext';
import { ToastProvider } from '../../src/contexts/ToastContext';
import { competitionApi } from '../../src/api/competition';
import { authApi } from '../../src/api/auth';

vi.mock('../../src/api/competition', () => ({
  competitionApi: {
    getState: vi.fn(),
  },
}));

vi.mock('../../src/api/auth', () => ({
  authApi: {
    getCsrf: vi.fn().mockResolvedValue('test-csrf'),
    getProfile: vi.fn(),
  },
}));

describe('Competition State Gating & Moderation Banners', () => {
  it('displays warning banner and disables submission form when competition is PAUSED', async () => {
    vi.mocked(competitionApi.getState).mockResolvedValueOnce({
      name: 'TechX CTF 2026',
      state: 'paused',
      startTime: null,
      endTime: null,
      registrationStartTime: null,
      registrationEndTime: null,
      timezone: 'Asia/Kolkata',
      isSubmissionEnabled: false,
    });

    vi.mocked(authApi.getProfile).mockResolvedValueOnce({
      success: true,
      user: { id: 'u-1', username: 'alice', role: 'participant' },
      team: { id: 't-1', name: 'Alpha', score: 100, status: 'ACTIVE' },
    });

    render(
      <ToastProvider>
        <AuthProvider>
          <CompetitionProvider>
            <StatusBanner />
            <SubmissionForm challengeId="c-1" onSolveSuccess={() => {}} />
          </CompetitionProvider>
        </AuthProvider>
      </ToastProvider>
    );

    expect(await screen.findByText(/Competition Paused:/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Submissions are temporarily disabled. Your team data and progress are safe./i)
    ).toBeInTheDocument();

    const input = screen.getByPlaceholderText('flag{...} or techx{...}');
    const submitBtn = screen.getByRole('button', { name: /submit/i });

    expect(input).toBeDisabled();
    expect(submitBtn).toBeDisabled();
  });

  it('displays danger banner and locks submissions when team is DISQUALIFIED', async () => {
    vi.mocked(competitionApi.getState).mockResolvedValueOnce({
      name: 'TechX CTF 2026',
      state: 'live',
      startTime: null,
      endTime: null,
      registrationStartTime: null,
      registrationEndTime: null,
      timezone: 'Asia/Kolkata',
      isSubmissionEnabled: true,
    });

    vi.mocked(authApi.getProfile).mockResolvedValueOnce({
      success: true,
      user: { id: 'u-1', username: 'badactor', role: 'participant' },
      team: { id: 't-1', name: 'Cheaters', score: 0, status: 'DISQUALIFIED' },
    });

    render(
      <ToastProvider>
        <AuthProvider>
          <CompetitionProvider>
            <StatusBanner />
            <SubmissionForm challengeId="c-1" onSolveSuccess={() => {}} />
          </CompetitionProvider>
        </AuthProvider>
      </ToastProvider>
    );

    expect(await screen.findByText(/Team Disqualified:/i)).toBeInTheDocument();
    const input = screen.getByPlaceholderText('flag{...} or techx{...}');
    expect(input).toBeDisabled();
  });
});
