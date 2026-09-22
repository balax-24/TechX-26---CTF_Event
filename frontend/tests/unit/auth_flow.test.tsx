import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../../src/contexts/AuthContext';
import { ToastProvider } from '../../src/contexts/ToastContext';
import { authApi } from '../../src/api/auth';

vi.mock('../../src/api/auth', () => ({
  authApi: {
    getCsrf: vi.fn().mockResolvedValue('test-csrf-token'),
    getProfile: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  },
}));

const TestConsumer: React.FC = () => {
  const { user, team, isAuthenticated, login, logout, isLoading } = useAuth();
  if (isLoading) return <div>Loading session...</div>;

  return (
    <div>
      <div data-testid="auth-status">{isAuthenticated ? 'LOGGED_IN' : 'GUEST'}</div>
      <div data-testid="username">{user?.username || 'none'}</div>
      <div data-testid="team-name">{team?.name || 'no-team'}</div>
      <button
        onClick={() => login({ emailOrUsername: 'alice', password: 'password123' })}
      >
        Login Button
      </button>
      <button onClick={() => logout()}>Logout Button</button>
    </div>
  );
};

describe('AuthContext Session Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('restores existing user session on mount from /auth/me', async () => {
    vi.mocked(authApi.getProfile).mockResolvedValueOnce({
      success: true,
      user: {
        id: 'u-1',
        username: 'alice',
        email: 'alice@example.com',
        role: 'participant',
        createdAt: new Date().toISOString(),
      },
      team: {
        id: 't-1',
        name: 'AlphaSquad',
        score: 250,
        status: 'ACTIVE',
        members: [],
        createdAt: new Date().toISOString(),
      },
    });

    render(
      <ToastProvider>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </ToastProvider>
    );

    expect(screen.getByText('Loading session...')).toBeInTheDocument();
    expect(await screen.findByTestId('auth-status')).toHaveTextContent('LOGGED_IN');
    expect(screen.getByTestId('username')).toHaveTextContent('alice');
    expect(screen.getByTestId('team-name')).toHaveTextContent('AlphaSquad');
  });

  it('handles guest session when /auth/me returns null', async () => {
    vi.mocked(authApi.getProfile).mockRejectedValueOnce(new Error('Unauthorized'));

    render(
      <ToastProvider>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </ToastProvider>
    );

    expect(await screen.findByTestId('auth-status')).toHaveTextContent('GUEST');
    expect(screen.getByTestId('username')).toHaveTextContent('none');
  });

  it('logs in and updates user & team context state', async () => {
    vi.mocked(authApi.getProfile).mockRejectedValueOnce(new Error('Unauthorized'));
    vi.mocked(authApi.login).mockResolvedValueOnce({
      success: true,
      user: {
        id: 'u-2',
        username: 'bob',
        email: 'bob@example.com',
        role: 'participant',
        createdAt: new Date().toISOString(),
      },
      team: {
        id: 't-2',
        name: 'BravoSec',
        score: 500,
        status: 'ACTIVE',
        members: [],
        createdAt: new Date().toISOString(),
      },
    });

    render(
      <ToastProvider>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </ToastProvider>
    );

    await screen.findByTestId('auth-status');
    const loginBtn = screen.getByText('Login Button');

    await act(async () => {
      loginBtn.click();
    });

    expect(screen.getByTestId('auth-status')).toHaveTextContent('LOGGED_IN');
    expect(screen.getByTestId('username')).toHaveTextContent('bob');
    expect(screen.getByTestId('team-name')).toHaveTextContent('BravoSec');
  });
});
