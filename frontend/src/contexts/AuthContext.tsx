import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, Team } from '../types/api';
import { authApi } from '../api/auth';
import { clearCachedCsrfToken, setOnUnauthorized } from '../api/client';
import { useToast } from './ToastContext';

interface AuthContextType {
  user: User | null;
  team: Team | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (data: { emailOrUsername: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setTeam: (team: Team | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [team, setTeamState] = useState<Team | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const { showToast } = useToast();

  const setTeam = useCallback((newTeam: Team | null) => {
    setTeamState(newTeam);
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const res = await authApi.getProfile();
      if (res.success && res.user) {
        setUser(res.user);
        setTeamState(res.team);
      } else {
        setUser(null);
        setTeamState(null);
      }
    } catch {
      setUser(null);
      setTeamState(null);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    // Attach global 401 interceptor
    setOnUnauthorized(() => {
      if (isMounted) {
        setUser(null);
        setTeamState(null);
        clearCachedCsrfToken();
      }
    });

    async function initSession() {
      setIsLoading(true);
      try {
        // Fetch current session profile
        const res = await authApi.getProfile().catch(() => null);
        if (isMounted && res && res.success && res.user) {
          setUser(res.user);
          setTeamState(res.team);
          // If valid session exists, ensure CSRF token is synchronized
          await authApi.getCsrf().catch(() => null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    initSession();

    return () => {
      isMounted = false;
      setOnUnauthorized(null);
    };
  }, []);

  const login = async (data: { emailOrUsername: string; password: string }) => {
    clearCachedCsrfToken(); // Invalidate any previous session token
    const res = await authApi.login(data);
    setUser(res.user);
    setTeamState(res.team);
    showToast(`Welcome back, ${res.user.username}!`, 'success');
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore logout network errors
    } finally {
      setUser(null);
      setTeamState(null);
      clearCachedCsrfToken();
      showToast('You have been logged out.', 'info');
    }
  };

  const isAuthenticated = !!user;
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  return (
    <AuthContext.Provider
      value={{
        user,
        team,
        isLoading,
        isAuthenticated,
        isAdmin,
        login,
        logout,
        refreshProfile,
        setTeam,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
