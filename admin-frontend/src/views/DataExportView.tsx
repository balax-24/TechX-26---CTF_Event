import React, { useState } from 'react';

export const DataExportView: React.FC = () => {
  const [downloadingType, setDownloadingType] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleDownload = async (type: string, label: string) => {
    setDownloadingType(type);
    setStatusMessage(`Generating and compiling authoritative CSV export for ${label}...`);
    try {
      const res = await fetch(`/api/v1/admin/export/${type}`);
      if (!res.ok) {
        throw new Error(`Export request rejected (${res.status})`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `techx_ctf_${type}_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setStatusMessage(`✓ Export complete: ${label} successfully downloaded.`);
    } catch (err: any) {
      setStatusMessage(`Error exporting data: ${err.message}`);
    } finally {
      setDownloadingType(null);
    }
  };

  const EXPORT_OPTIONS = [
    {
      id: 'teams',
      title: 'Teams Roster & Standings',
      description: 'Complete list of all registered teams, captains, current points, ban status, and creation timestamps.',
      records: 'All registered teams',
    },
    {
      id: 'participants',
      title: 'Participants Directory',
      description: 'All participant accounts, linked team memberships, email addresses, and account activity status.',
      records: 'All user accounts',
    },
    {
      id: 'leaderboard',
      title: 'Authoritative Leaderboard Snapshot',
      description: 'Deterministic ranking with rank, team name, total score, and precise last-solve timestamp tiebreakers.',
      records: 'Current leaderboard snapshot',
    },
    {
      id: 'submissions',
      title: 'Submissions Forensic Log (Sanitized)',
      description: 'Complete submission history with team, participant, challenge, result, IP, and timestamp. Flag secrets are strictly redacted.',
      records: 'Up to 1,000 most recent submissions',
    },
    {
      id: 'audit',
      title: 'Forensic Audit Trail',
      description: 'Immutable operations audit log containing actor roles, IPs, actions, entity changes, and recorded operational reasons.',
      records: 'Up to 1,000 audit records',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', textTransform: 'uppercase' }}>
          DATA EXPORT & ARCHIVAL REPORTS (CSV)
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
          Export sanitized operational datasets for post-event reporting, committee verification, and archival.
        </p>
      </div>

      {statusMessage && (
        <div
          style={{
            padding: '10px 14px',
            background: statusMessage.startsWith('✓') ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            borderLeft: `3px solid ${statusMessage.startsWith('✓') ? 'var(--status-green)' : 'var(--status-red)'}`,
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
          }}
        >
          {statusMessage}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        {EXPORT_OPTIONS.map((opt) => (
          <div
            key={opt.id}
            className="card"
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h4 style={{ fontSize: '14px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  {opt.title}
                </h4>
                <span className="badge" style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
                  CSV
                </span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '12px' }}>
                {opt.description}
              </p>
              <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', marginBottom: '16px' }}>
                Scope: {opt.records}
              </div>
            </div>

            <button
              className="btn btn-primary"
              disabled={downloadingType !== null}
              style={{ width: '100%' }}
              onClick={() => handleDownload(opt.id, opt.title)}
            >
              {downloadingType === opt.id ? 'Compiling CSV...' : `Export ${opt.title} (.csv)`}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
