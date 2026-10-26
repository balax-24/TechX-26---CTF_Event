import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import { Header } from './components/Header';
import { Sidebar, AdminSection } from './components/Sidebar';
import { LoginView } from './views/LoginView';
import { ForcePasswordChangeModal } from './views/ForcePasswordChangeModal';

// Section Views
import { OverviewView } from './views/OverviewView';
import { EventControlView } from './views/EventControlView';
import { TeamsView } from './views/TeamsView';
import { ParticipantsView } from './views/ParticipantsView';
import { ChallengesView } from './views/ChallengesView';
import { ChallengeFilesView } from './views/ChallengeFilesView';
import { CheckpointsView } from './views/CheckpointsView';
import { HintsView } from './views/HintsView';
import { SubmissionsView } from './views/SubmissionsView';
import { LeaderboardView } from './views/LeaderboardView';
import { DynamicChallengesView } from './views/DynamicChallengesView';
import { ScoringView } from './views/ScoringView';
import { ModerationView } from './views/ModerationView';
import { AuditLogsView } from './views/AuditLogsView';
import { SystemHealthView } from './views/SystemHealthView';
import { BackupsView } from './views/BackupsView';
import { AnnouncementsView } from './views/AnnouncementsView';
import { SettingsView } from './views/SettingsView';
import { SecurityView } from './views/SecurityView';
import { EmergencyControlsView } from './views/EmergencyControlsView';
import { DataExportView } from './views/DataExportView';

export const App: React.FC = () => {
  const { user, isAuthenticated, isLoading, mustChangePassword } = useAuth();
  const [currentSection, setCurrentSection] = useState<AdminSection>('overview');

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: 'var(--bg-main)',
          color: 'var(--accent-cyan)',
          fontFamily: 'var(--font-mono)',
          gap: '16px',
        }}
      >
        <div style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '2px' }}>
          TECHX CTF 2026 // ADMIN PORTAL
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          ESTABLISHING VERIFIED CONTROL SESSION...
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <LoginView />;
  }

  const renderSectionView = () => {
    switch (currentSection) {
      case 'overview':
        return <OverviewView />;
      case 'event-control':
        return <EventControlView />;
      case 'teams':
        return <TeamsView />;
      case 'participants':
        return <ParticipantsView />;
      case 'challenges':
        return <ChallengesView />;
      case 'files':
        return <ChallengeFilesView />;
      case 'checkpoints':
        return <CheckpointsView />;
      case 'hints':
        return <HintsView />;
      case 'submissions':
        return <SubmissionsView />;
      case 'leaderboard':
        return <LeaderboardView />;
      case 'dynamic-challenges':
        return <DynamicChallengesView />;
      case 'scoring':
        return <ScoringView />;
      case 'moderation':
        return <ModerationView />;
      case 'audit-logs':
        return <AuditLogsView />;
      case 'system-health':
        return <SystemHealthView />;
      case 'backups':
        return <BackupsView />;
      case 'announcements':
        return <AnnouncementsView />;
      case 'settings':
        return <SettingsView />;
      case 'security':
        return <SecurityView />;
      case 'emergency':
        return <EmergencyControlsView />;
      case 'export':
        return <DataExportView />;
      default:
        return <OverviewView />;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg-main)' }}>
      {/* Forced Password Change Modal */}
      {mustChangePassword && <ForcePasswordChangeModal />}

      {/* Global Admin Header */}
      <Header />

      {/* Main Content Area with Sidebar */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Sidebar currentSection={currentSection} onSelectSection={setCurrentSection} />
        <main
          style={{
            flex: 1,
            padding: '24px 32px',
            overflowY: 'auto',
            height: 'calc(100vh - 65px)',
          }}
        >
          {renderSectionView()}
        </main>
      </div>
    </div>
  );
};
