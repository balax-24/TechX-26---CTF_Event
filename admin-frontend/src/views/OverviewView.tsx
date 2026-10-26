import React, { useEffect, useState } from 'react';
import { OverviewTelemetry } from '../types';

export const OverviewView: React.FC = () => {
  const [data, setData] = useState<OverviewTelemetry | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchOverview = async () => {
    try {
      const res = await fetch('/api/v1/admin/overview');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {} finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
    const timer = setInterval(fetchOverview, 5000);
    return () => clearInterval(timer);
  }, []);

  const getStatusBadge = (status?: string) => {
    if (status === 'HEALTHY' || status === 'LIVE') return 'badge-green';
    if (status === 'DEGRADED' || status === 'PAUSED') return 'badge-amber';
    return 'badge-red';
  };

  if (isLoading && !data) {
    return <div style={{ padding: '24px', fontFamily: 'var(--font-mono)' }}>LOADING TELEMETRY...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Page Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', textTransform: 'uppercase' }}>
            OPERATIONS OVERVIEW & TELEMETRY
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
            Real-time tournament infrastructure status and operational pulse.
          </p>
        </div>
        <button onClick={() => fetchOverview()} className="btn btn-secondary">
          REFRESH TELEMETRY
        </button>
      </div>

      {/* Metrics Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
        }}
      >
        <div className="card">
          <div className="card-header">
            <span className="card-title">EVENT STATUS</span>
            <span className={`badge ${getStatusBadge(data?.eventStatus)}`}>
              {data?.eventStatus || 'UNKNOWN'}
            </span>
          </div>
          <div style={{ fontSize: '20px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
            {data?.eventStatus || '-'}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">ACTIVE TEAMS</span>
          </div>
          <div style={{ fontSize: '24px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-cyan)' }}>
            {data?.activeTeams ?? 0}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">PARTICIPANTS</span>
          </div>
          <div style={{ fontSize: '24px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>
            {data?.activeParticipants ?? 0}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">TOTAL SOLVES</span>
          </div>
          <div style={{ fontSize: '24px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--status-green)' }}>
            {data?.totalSolves ?? 0}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">SUBMISSIONS</span>
          </div>
          <div style={{ fontSize: '24px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#388bfd' }}>
            {data?.totalSubmissions ?? 0}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">HINTS UNLOCKED</span>
          </div>
          <div style={{ fontSize: '24px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--status-amber)' }}>
            {data?.hintsUsed ?? 0}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">LEADERBOARD v</span>
          </div>
          <div style={{ fontSize: '24px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>
            {data?.currentLeaderboardVersion ?? 0}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">SSE CLIENTS</span>
          </div>
          <div style={{ fontSize: '24px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-cyan)' }}>
            {data?.sseConnections ?? 0}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">DYNAMIC PODS</span>
          </div>
          <div style={{ fontSize: '24px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-cyan)' }}>
            {data?.dynamicInstances ?? 0}
          </div>
        </div>
      </div>

      {/* Infrastructure Health Status */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">INFRASTRUCTURE HEALTH</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>FASTIFY CORE</div>
            <div style={{ marginTop: '4px' }}>
              <span className={`badge ${getStatusBadge(data?.health.server)}`}>{data?.health.server || 'OK'}</span>
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>POSTGRESQL 16</div>
            <div style={{ marginTop: '4px' }}>
              <span className={`badge ${getStatusBadge(data?.health.database)}`}>{data?.health.database || 'OK'}</span>
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>REDIS 7 PUB/SUB</div>
            <div style={{ marginTop: '4px' }}>
              <span className={`badge ${getStatusBadge(data?.health.redis)}`}>{data?.health.redis || 'OK'}</span>
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>CHALLENGE GATEWAY</div>
            <div style={{ marginTop: '4px' }}>
              <span className={`badge ${getStatusBadge(data?.health.gateway)}`}>{data?.health.gateway || 'OK'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Activity Feed */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Recent Solves */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">RECENT SOLVES</span>
            <span className="badge badge-gray">{data?.recentSolves?.length ?? 0} LATEST</span>
          </div>
          {data?.recentSolves && data.recentSolves.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {data.recentSolves.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 10px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-dim)',
                    borderRadius: '3px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>{s.teamName}</span>
                    <span style={{ color: 'var(--text-muted)', margin: '0 6px' }}>solved</span>
                    <span style={{ color: 'var(--text-primary)' }}>{s.challengeTitle}</span>
                  </div>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {new Date(s.solvedAt).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center', padding: '16px' }}>
              No solves recorded yet.
            </div>
          )}
        </div>

        {/* Recent Failed Submissions */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">RECENT FAILED SUBMISSIONS</span>
            <span className="badge badge-red">{data?.recentFailedSubmissions?.length ?? 0} LATEST</span>
          </div>
          {data?.recentFailedSubmissions && data.recentFailedSubmissions.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {data.recentFailedSubmissions.map((sub) => (
                <div
                  key={sub.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 10px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-dim)',
                    borderRadius: '3px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                  }}
                >
                  <div>
                    <span style={{ color: '#f87171', fontWeight: 600 }}>{sub.teamName}</span>
                    <span style={{ color: 'var(--text-muted)', margin: '0 6px' }}>({sub.username})</span>
                    <span style={{ color: 'var(--text-primary)' }}>{sub.challengeTitle}</span>
                  </div>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {new Date(sub.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center', padding: '16px' }}>
              No failed submissions recently.
            </div>
          )}
        </div>
      </div>

      {/* Two Column Admin & Security Events */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Recent Admin Actions */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">RECENT ADMIN ACTIONS</span>
          </div>
          {data?.recentAdminActions && data.recentAdminActions.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {data.recentAdminActions.map((act) => (
                <div
                  key={act.id}
                  style={{
                    padding: '8px 10px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-dim)',
                    borderRadius: '3px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>{act.action}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{new Date(act.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)' }}>{act.reason || 'Admin operation executed'}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center', padding: '16px' }}>
              No admin activity logged.
            </div>
          )}
        </div>

        {/* Recent Security Events */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">RECENT SECURITY AUDIT EVENTS</span>
          </div>
          {data?.recentSecurityEvents && data.recentSecurityEvents.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {data.recentSecurityEvents.map((sec) => (
                <div
                  key={sec.id}
                  style={{
                    padding: '8px 10px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-dim)',
                    borderRadius: '3px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span style={{ color: '#f87171', fontWeight: 600 }}>{sec.action}</span>
                    <span style={{ color: 'var(--text-muted)' }}>IP: {sec.actorIp}</span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)' }}>{sec.reason || 'Security event recorded'}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center', padding: '16px' }}>
              Zero security alerts recorded.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
