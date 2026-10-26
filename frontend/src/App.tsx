import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './contexts/ToastContext';
import { AuthProvider } from './contexts/AuthContext';
import { CompetitionProvider } from './contexts/CompetitionContext';
import { LeaderboardProvider } from './contexts/LeaderboardContext';
import { AppShell } from './components/layout/AppShell';
import { ProtectedRoute } from './components/common/ProtectedRoute';

import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ChallengesPage } from './pages/ChallengesPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { TeamPage } from './pages/TeamPage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <CompetitionProvider>
            <LeaderboardProvider>
              <AppShell>
                <Routes>
                  {/* Public Routes */}
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/leaderboard" element={<LeaderboardPage />} />

                  {/* Authenticated Participant Routes */}
                  <Route
                    path="/dashboard"
                    element={
                      <ProtectedRoute>
                        <DashboardPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/challenges"
                    element={
                      <ProtectedRoute>
                        <ChallengesPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/team"
                    element={
                      <ProtectedRoute>
                        <TeamPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Fallback */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </AppShell>
            </LeaderboardProvider>
          </CompetitionProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
};

export default App;
