import React, { useEffect, useState } from 'react';
import { BackupItem } from '../types';
import { useAuth } from '../context/AuthContext';
import { ConfirmModal } from '../components/ConfirmModal';

export const BackupsView: React.FC = () => {
  const { csrfToken, user } = useAuth();
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Restore Modal State
  const [selectedBackupForRestore, setSelectedBackupForRestore] = useState<string | null>(null);

  const fetchBackups = async () => {
    try {
      const res = await fetch('/api/v1/admin/backups');
      if (res.ok) {
        const data = await res.json();
        setBackups(Array.isArray(data) ? data : []);
      }
    } catch {} finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const handleCreateBackup = async () => {
    setIsCreating(true);
    setStatusMessage('Generating atomic PostgreSQL pg_dump snapshot...');
    try {
      const res = await fetch('/api/v1/admin/backups/create', {
        method: 'POST',
        headers: {
          'x-csrf-token': csrfToken || '',
        },
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMessage(`✓ Snapshot generated successfully: ${data.filename} (${(data.sizeBytes / 1024).toFixed(1)} KB)`);
        fetchBackups();
      } else {
        setStatusMessage(`Error: ${data.message || 'Backup generation failed'}`);
      }
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleExecuteRestore = async () => {
    if (!selectedBackupForRestore) return;
    const filename = selectedBackupForRestore;
    setSelectedBackupForRestore(null);

    setStatusMessage(`INITIATING DATABASE RESTORE FROM ${filename}... PLEASE WAIT.`);
    try {
      const res = await fetch(`/api/v1/admin/backups/${filename}/restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken || '',
        },
        body: JSON.stringify({
          confirmationPhrase: 'RESTORE',
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setStatusMessage(`✓ DATABASE RESTORE COMPLETE from ${filename}. All tables verified.`);
      } else {
        setStatusMessage(`Restore Failed: ${data.message || 'Backend rejected restore operation'}`);
      }
    } catch (err: any) {
      setStatusMessage(`Restore Error: ${err.message}`);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const isSuperadmin = user?.role === 'superadmin';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', textTransform: 'uppercase' }}>
            DATABASE BACKUPS & DISASTER RESTORATION
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
            Periodic and on-demand PostgreSQL tar/sql dumps with dual-authorization restoration protection.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={fetchBackups}>
            Refresh List
          </button>
          <button
            className="btn btn-primary"
            disabled={isCreating}
            onClick={handleCreateBackup}
          >
            {isCreating ? 'Creating Snapshot...' : '+ Generate Immediate Snapshot'}
          </button>
        </div>
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

      {!isSuperadmin && (
        <div
          style={{
            padding: '10px 14px',
            background: 'rgba(234, 179, 8, 0.1)',
            borderLeft: '3px solid var(--status-amber)',
            color: '#fef08a',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
          }}
        >
          NOTE: Database restoration is strictly restricted to SUPERADMIN operators. Regular admins can view and create snapshots only.
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th>Backup Archive Filename</th>
              <th>File Size</th>
              <th>Timestamp</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                  Scanning backup directory...
                </td>
              </tr>
            ) : backups.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                  No backup archives found. Click "Generate Immediate Snapshot" to create the first dump.
                </td>
              </tr>
            ) : (
              backups.map((b) => (
                <tr key={b.filename}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--accent-cyan)', fontWeight: 600 }}>
                    {b.filename}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                    {formatSize(b.sizeBytes)}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
                    {new Date(b.createdAt).toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn btn-danger"
                      disabled={!isSuperadmin}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        opacity: isSuperadmin ? 1 : 0.4,
                        cursor: isSuperadmin ? 'pointer' : 'not-allowed',
                      }}
                      onClick={() => setSelectedBackupForRestore(b.filename)}
                    >
                      Restore Snapshot
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedBackupForRestore && (
        <ConfirmModal
          isOpen={true}
          title="CRITICAL: DESTRUCTIVE RESTORE OF ENTIRE DATABASE"
          message={`You are about to restore the PostgreSQL database from "${selectedBackupForRestore}". All current table states, live submissions, and in-flight sessions will be overwritten by this backup.`}
          warningNote="This cannot be undone. Make sure you create an immediate snapshot of the current state before restoring."
          requiredPhrase="RESTORE"
          confirmLabel="Execute Destructive Restore"
          isDestructive={true}
          onConfirm={handleExecuteRestore}
          onCancel={() => setSelectedBackupForRestore(null)}
        />
      )}
    </div>
  );
};
