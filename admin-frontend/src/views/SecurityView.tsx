import React, { useEffect, useState } from 'react';

interface SecurityEvent {
  id: string;
  action: string;
  actorId?: string;
  actorRole: string;
  actorIp: string;
  entityType: string;
  entityId?: string;
  reason?: string;
  detailsJson?: any;
  createdAt: string;
}

export const SecurityView: React.FC = () => {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const fetchSecurityEvents = async (targetPage = 1) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', targetPage.toString());
      params.set('limit', '25');
      if (searchTerm.trim()) params.set('search', searchTerm.trim());

      const res = await fetch(`/api/v1/admin/security/events?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
        setTotal(data.total || 0);
        setPage(targetPage);
      }
    } catch {} finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSecurityEvents(1);
    const interval = setInterval(() => fetchSecurityEvents(page), 8000);
    return () => clearInterval(interval);
  }, [searchTerm]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', textTransform: 'uppercase' }}>
            OPERATIONS SECURITY CENTER & THREAT TELEMETRY
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
            Real-time feed of authentication failures, rate limit triggers, CSRF blocks, and suspicious payload vectors.
          </p>
        </div>

        <button className="btn btn-secondary" onClick={() => fetchSecurityEvents(page)}>
          Refresh Threat Stream
        </button>
      </div>

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search by IP, Action, or Threat Signature..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ maxWidth: '360px' }}
        />
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          Security Detections: {total} total
        </span>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-dim)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600 }}>
            SECURITY LOG ENTRIES (Page {page} of {Math.max(1, Math.ceil(total / 25))})
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              className="btn btn-secondary"
              disabled={page <= 1}
              onClick={() => fetchSecurityEvents(page - 1)}
              style={{ padding: '4px 10px', fontSize: '11px' }}
            >
              Prev
            </button>
            <button
              className="btn btn-secondary"
              disabled={page >= Math.ceil(total / 25)}
              onClick={() => fetchSecurityEvents(page + 1)}
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
              <th>Threat Event Classification</th>
              <th>Source IP</th>
              <th>Actor Role</th>
              <th>Threat Reason / Context</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && events.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                  Polling security event stream...
                </td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                  No security incidents or anomalies matching current filter.
                </td>
              </tr>
            ) : (
              events.map((ev) => (
                <tr key={ev.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {new Date(ev.createdAt).toLocaleString()}
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        background: 'rgba(239, 68, 68, 0.15)',
                        color: 'var(--status-red)',
                        border: '1px solid var(--status-red)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                      }}
                    >
                      {ev.action}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--accent-cyan)' }}>
                    {ev.actorIp}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', textTransform: 'uppercase' }}>
                    {ev.actorRole}
                  </td>
                  <td style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                    {ev.reason || 'Security event logged by perimeter guard'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
