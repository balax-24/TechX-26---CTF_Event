import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChallengeCard } from '../../src/components/challenges/ChallengeCard';
import { SubmissionForm } from '../../src/components/challenges/SubmissionForm';
import { ToastProvider } from '../../src/contexts/ToastContext';
import { AuthProvider } from '../../src/contexts/AuthContext';
import { CompetitionProvider } from '../../src/contexts/CompetitionContext';
import { submissionsApi } from '../../src/api/submissions';

vi.mock('../../src/api/submissions', () => ({
  submissionsApi: {
    submitFlag: vi.fn(),
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

describe('Challenge Card & Submission Interactions', () => {
  it('renders challenge card with points, difficulty, and category', () => {
    const onCardClick = vi.fn();
    render(
      <ChallengeCard
        challenge={{
          id: 'c-1',
          slug: 'sql-injection-101',
          title: 'SQL Injection 101',
          category: 'Web',
          difficulty: 'beginner',
          points: 100,
          solveCount: 42,
          isSolved: false,
        }}
        onClick={onCardClick}
      />
    );

    expect(screen.getByText('SQL Injection 101')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('beginner')).toBeInTheDocument();
    expect(screen.getByText('Web')).toBeInTheDocument();
    expect(screen.getByText('42 solves')).toBeInTheDocument();

    fireEvent.click(screen.getByText('SQL Injection 101'));
    expect(onCardClick).toHaveBeenCalledTimes(1);
  });

  it('renders checkmark when challenge is solved', () => {
    render(
      <ChallengeCard
        challenge={{
          id: 'c-2',
          slug: 'crypto-rsa',
          title: 'RSA Master',
          category: 'Crypto',
          difficulty: 'expert',
          points: 500,
          solveCount: 3,
          isSolved: true,
        }}
        onClick={() => {}}
      />
    );

    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('submits flag and handles success response', async () => {
    vi.mocked(submissionsApi.submitFlag).mockResolvedValueOnce({
      success: true,
      status: 'correct',
      pointsAwarded: 100,
      newScore: 350,
    });

    const onSolveSuccess = vi.fn();

    render(
      <ToastProvider>
        <AuthProvider>
          <CompetitionProvider>
            <SubmissionForm
              challengeId="c-1"
              isSolved={false}
              onSolveSuccess={onSolveSuccess}
            />
          </CompetitionProvider>
        </AuthProvider>
      </ToastProvider>
    );

    const input = screen.getByPlaceholderText('flag{...} or techx{...}');
    const submitBtn = screen.getByRole('button', { name: /submit/i });

    fireEvent.change(input, { target: { value: 'techx{valid_sql_injection_flag}' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(submissionsApi.submitFlag).toHaveBeenCalledWith(
        'c-1',
        'techx{valid_sql_injection_flag}'
      );
    });

    expect(onSolveSuccess).toHaveBeenCalledWith(100, 350);
    expect(await screen.findByText(/Challenge Solved! \+100 points/i)).toBeInTheDocument();
  });

  it('displays error message on incorrect flag submission', async () => {
    vi.mocked(submissionsApi.submitFlag).mockResolvedValueOnce({
      success: false,
      status: 'incorrect',
      pointsAwarded: 0,
      newScore: 250,
    });

    render(
      <ToastProvider>
        <AuthProvider>
          <CompetitionProvider>
            <SubmissionForm
              challengeId="c-1"
              isSolved={false}
              onSolveSuccess={() => {}}
            />
          </CompetitionProvider>
        </AuthProvider>
      </ToastProvider>
    );

    const input = screen.getByPlaceholderText('flag{...} or techx{...}');
    fireEvent.change(input, { target: { value: 'techx{wrong_flag}' } });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    expect(
      await screen.findByText(/Incorrect flag. The submitted flag was not accepted./i)
    ).toBeInTheDocument();
  });
});
