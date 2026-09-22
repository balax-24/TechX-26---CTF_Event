import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Modal } from '../../src/components/common/Modal';
import { Input } from '../../src/components/common/Input';
import { Button } from '../../src/components/common/Button';
import { ChallengeModal } from '../../src/components/challenges/ChallengeModal';
import { challengesApi } from '../../src/api/challenges';
import { ToastProvider } from '../../src/contexts/ToastContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { useCompetition } from '../../src/contexts/CompetitionContext';

vi.mock('../../src/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../src/contexts/CompetitionContext', () => ({
  useCompetition: vi.fn(),
}));

describe('Stage 7 Hardening: Modal, Mobile UX & Accessibility (A11y)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('Modal provides accessible dialog semantics and closes on Escape key', () => {
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} title="Security Advisory">
        <p>Modal content</p>
      </Modal>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeDefined();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('modal-title');

    // Test close button touch target
    const closeBtn = screen.getByLabelText('Close modal');
    expect(closeBtn).toBeDefined();
    expect(closeBtn.style.minWidth).toBe('44px');
    expect(closeBtn.style.minHeight).toBe('44px');

    // Test Escape key
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('Input component binds aria-invalid and aria-describedby when errors exist', () => {
    const { rerender } = render(
      <Input label="Team Name" id="team-name" placeholder="Enter team name" />
    );

    const input = screen.getByPlaceholderText('Enter team name');
    expect(input.getAttribute('aria-invalid')).toBe('false');
    expect(input.getAttribute('aria-describedby')).toBeNull();

    // Rerender with error message
    rerender(
      <Input
        label="Team Name"
        id="team-name"
        placeholder="Enter team name"
        error="Team name is already taken"
      />
    );

    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('team-name-error');

    const errorMsg = screen.getByRole('alert');
    expect(errorMsg.id).toBe('team-name-error');
    expect(errorMsg.textContent).toBe('Team name is already taken');
  });

  it('Button sizes enforce accessible touch targets', () => {
    const { container } = render(
      <div>
        <Button size="sm">Small Action</Button>
        <Button size="md">Medium Action</Button>
        <Button size="lg">Large Action</Button>
      </div>
    );

    const buttons = container.querySelectorAll('button');
    expect(buttons[0].style.minWidth).toBe('44px');
    expect(buttons[0].style.minHeight).toBe('38px');

    expect(buttons[1].style.minWidth).toBe('44px');
    expect(buttons[1].style.minHeight).toBe('44px');

    expect(buttons[2].style.minWidth).toBe('48px');
    expect(buttons[2].style.minHeight).toBe('48px');
  });

  it('ChallengeModal safely renders complex challenge data without layout overflow', async () => {
    const challengeData: any = {
      id: 'c1',
      title: 'Advanced Memory Corruption',
      slug: 'adv-mem-corr',
      category: 'pwn',
      difficulty: 'expert',
      points: 500,
      solveCount: 4,
      author: 'SecurityTeam',
      description:
        'A comprehensive binary exploitation challenge involving complex heap exploitation, stack canaries, and ASLR bypass.',
      connectionInfo: 'nc challenges.techx.lan 31337 --ssl --cert=/opt/certs/client.pem',
      files: [{ id: 'f1', filename: 'exploit_target.elf', size: 1048576 }],
      hints: [{ id: 'h1', hintNumber: 1, penaltyPoints: 50, isUnlocked: false }],
      checkpoints: [
        {
          id: 'cp1',
          challengeId: 'c1',
          title: 'Heap Leak',
          stepNumber: 1,
          points: 100,
          isSolved: false,
        },
      ],
      isSolved: false,
    };

    vi.spyOn(challengesApi, 'getChallengeBySlug').mockResolvedValue(challengeData);

    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1', username: 'pwnmaster' } as any,
      team: { id: 't1', name: 'Hackers', score: 300 } as any,
      refreshProfile: vi.fn(),
    } as any);

    vi.mocked(useCompetition).mockReturnValue({
      isPaused: false,
      isEnded: false,
    } as any);

    render(
      <ToastProvider>
        <ChallengeModal slug="adv-mem-corr" onClose={vi.fn()} onSolve={vi.fn()} />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Advanced Memory Corruption')).toBeDefined();
      expect(screen.getByText(/nc challenges.techx.lan 31337/i)).toBeDefined();
      expect(screen.getByText('exploit_target.elf')).toBeDefined();
      expect(screen.getByText(/Hint 1/i)).toBeDefined();
      expect(screen.getByText(/Penalty: -50 pts/i)).toBeDefined();
      expect(screen.getByText(/Step 1: Heap Leak/i)).toBeDefined();
    });

    // Verify connection string has wordBreak: break-all
    const codeBlock = screen.getByText(/nc challenges.techx.lan 31337/i);
    expect(codeBlock.style.wordBreak).toBe('break-all');
  });
});
