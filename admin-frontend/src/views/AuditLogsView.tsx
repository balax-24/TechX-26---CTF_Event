import React, { useEffect, useState } from 'react';
import { AuditLog } from '../types';

export const AuditLogsView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const fetchLogs = async (targetPage = 1) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', targetPage.toString());
      params.set('limit', '25');
      if (actionFilter.trim()) params.set('action', actionFilter.trim());
      if (entityFilter.trim()) params.set('entityType', entityFilter.trim());

      const res = await fetch(`/api/v1/admin/audit-logs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setTotal(data.total || 0);
        setPage(targetPage);
      }
    } catch {} finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1);
  }, [actionFilter, entityFilter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', textTransform: 'uppercase' }}>
            IMMUTABLE OPERATIONS AUDIT LOG
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
            Append-only forensic event trail. Modifying or pruning historical audit records is strictly prohibited.
          </p>
        </div>

        <button className="btn btn-secondary" onClick={() => fetchLogs(page)}>
          Refresh Log Trail
        </button>
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Filter by Action (e.g. TEAM_STATUS_CHANGE, CHALLENGE_UPDATE)..."
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          style={{ maxWidth: '320px' }}
        />
        <input
          type="text"
          placeholder="Filter by Entity Type (e.g. challenge, team, user)..."
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          style={{ maxWidth: '260px' }}
        />
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          Total Logged Events: {total}
        </span>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-dim)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600 }}>
            FORENSIC TRAIL (Page {page} of {Math.max(1, Math.ceil(total / 25))})
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              className="btn btn-secondary"
              disabled={page <= 1}
              onClick={() => fetchLogs(page - 1)}
              style={{ padding: '4px 10px', fontSize: '11px' }}
            >
              Prev
            </button>
            <button
              className="btn btn-secondary"
              disabled={page >= Math.ceil(total / 25)}
              onClick={() => fetchLogs(page + 1)}
              style={{ padding: '4px 10px', fontSize: '11px' }}
            >
              Next
            </button>
          </div>
        </div>

        <table className="table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Action Name</th>
              <th>Actor Role</th>
              <th>Entity</th>
              <th>Source IP</th>
              <th>Reason / Justification</th>
              <th>Payload</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                  Streaming forensic audit records...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                  No audit log entries matching query filters.
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const isExpanded = expandedLogId === log.id;
                return (
                  <React.Fragment key={log.id}>
                    <tr>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '11px',
                            background: 'rgba(6, 182, 212, 0.1)',
                            color: 'var(--accent-cyan)',
                            border: '1px solid rgba(6, 182, 212, 0.3)',
                          }}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', textTransform: 'uppercase' }}>
                        {log.actorRole}
                      </td>
                      <td style={{ fontSize: '12px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>{log.entityType}:</span> {log.entityId?.substring(0, 8)}...
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                        {log.actorIp}
                      </td>
                      <td style={{ fontSize: '12px', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.reason || '—'}
                      </td>
                      <td>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '2px 8px', fontSize: '10px' }}
                          onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                        >
                          {isExpanded ? 'Hide' : 'Inspect'}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} style={{ background: '#070b12', padding: '12px 18px', borderBottom: '1px solid var(--border-dim)' }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                            <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>
                              Audit ID: <span style={{ color: 'var(--text-primary)' }}>{log.id}</span> | Actor ID: <span style={{ color: 'var(--text-primary)' }}>{log.actorId || 'SYSTEM'}</span>
                            </div>
                            <pre
                              style={{
                                background: '#0b1320',
                                padding: '10px',
                                borderRadius: '4px',
                                overflowX: 'auto',
                                color: '#a5f3fc',
                                border: '1px solid #1e2c40',
                              }}
                            >
                              {JSON.stringify(log.detailsJson || { reason: log.reason }, null, 2)}
                            </pre>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
