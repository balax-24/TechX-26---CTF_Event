import React, { useEffect, useState } from 'react';
import { DynamicInstance } from '../types';
import { useAuth } from '../context/AuthContext';
import { ConfirmModal } from '../components/ConfirmModal';

export const DynamicChallengesView: React.FC = () => {
  const { csrfToken } = useAuth();
  const [instances, setInstances] = useState<DynamicInstance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCleanupModal, setShowCleanupModal] = useState(false);

  const fetchInstances = async () => {
    try {
      const res = await fetch('/api/v1/admin/dynamic-instances');
      if (res.ok) {
        const data = await res.json();
        setInstances(Array.isArray(data) ? data : []);
      }
    } catch {} finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInstances();
    const interval = setInterval(fetchInstances, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleCleanupExpired = async () => {
    setShowCleanupModal(false);
    try {
      setStatusMessage('Executing automated pruning of expired dynamic challenge containers...');
      const res = await fetch('/api/v1/admin/dynamic-instances/cleanup-expired', {
        method: 'POST',
        headers: {
          'x-csrf-token': csrfToken || '',
        },
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMessage(`✓ Pruning complete: ${data.cleanedCount ?? 0} expired instances recycled.`);
        fetchInstances();
      } else {
        setStatusMessage(`Error: ${data.message || 'Pruning operation failed'}`);
      }
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
    }
  };

  const filteredInstances = instances.filter(
    (inst) =>
      inst.teamName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inst.challengeTitle?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inst.containerName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', textTransform: 'uppercase' }}>
            DYNAMIC CHALLENGE INSTANCES
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
            Live sandboxed Docker containers provisioned per-team with isolated lifecycle management.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={fetchInstances}>
            Refresh State
          </button>
          <button
            className="btn btn-danger"
            onClick={() => setShowCleanupModal(true)}
          >
            Prune Expired Containers
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

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Filter by Team, Challenge, or Container..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ maxWidth: '340px' }}
        />
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          Active Instances: {filteredInstances.length} / {instances.length} total
        </span>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th>Status</th>
              <th>Team</th>
              <th>Challenge</th>
              <th>Container Identifier</th>
              <th>Port Allocation</th>
              <th>Provisioned At</th>
              <th>Expires At</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                  Polling dynamic instance runtime state...
                </td>
              </tr>
            ) : filteredInstances.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                  No active challenge instances matching current filter.
                </td>
              </tr>
            ) : (
              filteredInstances.map((inst) => {
                const isExpired = new Date(inst.expiresAt).getTime() < Date.now();
                return (
                  <tr key={inst.id}>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background: isExpired
                            ? 'rgba(239, 68, 68, 0.15)'
                            : inst.status === 'RUNNING' || inst.status === 'active'
                            ? 'rgba(34, 197, 94, 0.15)'
                            : 'rgba(234, 179, 8, 0.15)',
                          color: isExpired
                            ? 'var(--status-red)'
                            : inst.status === 'RUNNING' || inst.status === 'active'
                            ? 'var(--status-green)'
                            : 'var(--status-amber)',
                          border: `1px solid ${
                            isExpired
                              ? 'var(--status-red)'
                              : inst.status === 'RUNNING' || inst.status === 'active'
                              ? 'var(--status-green)'
                              : 'var(--status-amber)'
                          }`,
                        }}
                      >
                        {isExpired ? 'EXPIRED' : (inst.status || 'ACTIVE').toUpperCase()}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {inst.teamName}
                    </td>
                    <td>{inst.challengeTitle}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--accent-cyan)' }}>
                      {inst.containerName}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                      {inst.internalPort ? `:${inst.internalPort}` : 'N/A'}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
                      {new Date(inst.createdAt).toLocaleTimeString()}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: isExpired ? 'var(--status-red)' : 'var(--text-muted)' }}>
                      {new Date(inst.expiresAt).toLocaleTimeString()}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        isOpen={showCleanupModal}
        title="Prune Expired Dynamic Instances"
        message="Are you sure you want to stop and remove all expired challenge containers? Any stale port bindings and bridge network leases will be released."
        requiredPhrase="PRUNE"
        confirmLabel="Authorize Prune"
        isDestructive={true}
        onConfirm={handleCleanupExpired}
        onCancel={() => setShowCleanupModal(false)}
      />
    </div>
  );
};
