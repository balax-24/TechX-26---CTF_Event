import React from 'react';

export type AdminSection =
  | 'overview'
  | 'event-control'
  | 'teams'
  | 'participants'
  | 'challenges'
  | 'files'
  | 'checkpoints'
  | 'hints'
  | 'submissions'
  | 'leaderboard'
  | 'dynamic-challenges'
  | 'scoring'
  | 'moderation'
  | 'audit-logs'
  | 'system-health'
  | 'backups'
  | 'announcements'
  | 'settings'
  | 'security'
  | 'emergency'
  | 'export';

interface SidebarProps {
  currentSection: AdminSection;
  onSelectSection: (section: AdminSection) => void;
}

const SECTIONS: Array<{ id: AdminSection; label: string; number: string; isDanger?: boolean }> = [
  { id: 'overview', label: 'Overview', number: '01' },
  { id: 'event-control', label: 'Event Control', number: '02' },
  { id: 'teams', label: 'Teams', number: '03' },
  { id: 'participants', label: 'Participants', number: '04' },
  { id: 'challenges', label: 'Challenges', number: '05' },
  { id: 'files', label: 'Challenge Files', number: '06' },
  { id: 'checkpoints', label: 'Checkpoints', number: '07' },
  { id: 'hints', label: 'Hints', number: '08' },
  { id: 'submissions', label: 'Submissions', number: '09' },
  { id: 'leaderboard', label: 'Leaderboard', number: '10' },
  { id: 'dynamic-challenges', label: 'Dynamic Challenges', number: '11' },
  { id: 'scoring', label: 'Scoring Ledger', number: '12' },
  { id: 'moderation', label: 'Moderation', number: '13' },
  { id: 'audit-logs', label: 'Audit Logs', number: '14' },
  { id: 'system-health', label: 'System Health', number: '15' },
  { id: 'backups', label: 'Backups', number: '16' },
  { id: 'announcements', label: 'Announcements', number: '17' },
  { id: 'settings', label: 'Settings', number: '18' },
  { id: 'security', label: 'Security Center', number: '19' },
  { id: 'emergency', label: 'Emergency Controls', number: '20', isDanger: true },
  { id: 'export', label: 'Data Export (CSV)', number: 'EX' },
];

export const Sidebar: React.FC<SidebarProps> = ({ currentSection, onSelectSection }) => {
  return (
    <aside
      style={{
        width: '230px',
        minWidth: '230px',
        background: '#0a0f18',
        borderRight: '1px solid #1e2c40',
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 65px)',
        position: 'sticky',
        top: '65px',
        overflowY: 'auto',
      }}
    >
      <div style={{ padding: '12px 14px', borderBottom: '1px solid #1e2c40' }}>
        <span
          style={{
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '1px',
          }}
        >
          OPERATIONS DIRECTORY
        </span>
      </div>

      <nav style={{ padding: '6px 0', display: 'flex', flexDirection: 'column', gap: '1px' }}>
        {SECTIONS.map((sec) => {
          const isActive = currentSection === sec.id;
          return (
            <button
              key={sec.id}
              onClick={() => onSelectSection(sec.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 14px',
                background: isActive
                  ? sec.isDanger
                    ? 'rgba(239, 68, 68, 0.15)'
                    : 'rgba(0, 212, 255, 0.1)'
                  : 'transparent',
                border: 'none',
                borderLeft: isActive
                  ? `3px solid ${sec.isDanger ? 'var(--status-red)' : 'var(--accent-cyan)'}`
                  : '3px solid transparent',
                color: isActive
                  ? sec.isDanger
                    ? '#f87171'
                    : 'var(--accent-cyan)'
                  : sec.isDanger
                  ? '#ef4444'
                  : 'var(--text-secondary)',
                fontSize: '12px',
                fontFamily: 'var(--font-sans)',
                fontWeight: isActive ? 600 : 400,
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'background 0.1s, color 0.1s',
                width: '100%',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: isActive
                    ? sec.isDanger
                      ? '#f87171'
                      : 'var(--accent-cyan)'
                    : 'var(--text-muted)',
                  minWidth: '20px',
                }}
              >
                {sec.number}
              </span>
              <span>{sec.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
};
