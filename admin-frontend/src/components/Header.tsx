import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { OverviewTelemetry } from '../types';

export const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const [telemetry, setTelemetry] = useState<OverviewTelemetry | null>(null);

  const fetchTelemetry = async () => {
    try {
      const res = await fetch('/api/v1/admin/overview');
      if (res.ok) {
        const data = await res.json();
        setTelemetry(data);
      }
    } catch {}
  };

  useEffect(() => {
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 5000);
    return () => clearInterval(interval);
  }, []);

  const getStatusBadgeClass = (status?: string) => {
    if (status === 'HEALTHY' || status === 'LIVE') return 'badge-green';
    if (status === 'DEGRADED' || status === 'PAUSED' || status === 'REGISTRATION_OPEN') return 'badge-amber';
    return 'badge-red';
  };

  return (
    <header style={{
      background: '#0a0f18',
      borderBottom: '1px solid #1e2c40',
      padding: '8px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      position: 'sticky',
      top: 0,
      zIndex: 1000,
    }}>
      {/* Top Bar: Title & User */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            background: 'rgba(0, 212, 255, 0.1)',
            border: '1px solid var(--accent-cyan)',
            padding: '4px 8px',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '1px',
            color: 'var(--accent-cyan)',
          }}>
            TECHX CTF 2026
          </div>
          <div style={{
            fontSize: '13px',
            fontWeight: 700,
            letterSpacing: '0.8px',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            textTransform: 'uppercase',
          }}>
            ADMIN CONTROL CENTER
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
            <span style={{ color: 'var(--text-muted)' }}>ADMIN USER:</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>
              {user?.username}
            </span>
            <span className={`badge ${user?.role === 'superadmin' ? 'badge-cyan' : 'badge-blue'}`}>
              {user?.role}
            </span>
          </div>
          <button onClick={() => logout()} className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: '11px' }}>
            LOGOUT
          </button>
        </div>
      </div>

      {/* Telemetry Strip */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        overflowX: 'auto',
        paddingTop: '4px',
        fontSize: '11px',
        fontFamily: 'var(--font-mono)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ color: 'var(--text-muted)' }}>EVENT:</span>
          <span className={`badge ${getStatusBadgeClass(telemetry?.eventStatus)}`}>
            {telemetry?.eventStatus || 'CONNECTING...'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ color: 'var(--text-muted)' }}>SERVER:</span>
          <span className={`badge ${getStatusBadgeClass(telemetry?.health?.server)}`}>
            {telemetry?.health?.server || 'OK'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ color: 'var(--text-muted)' }}>DB:</span>
          <span className={`badge ${getStatusBadgeClass(telemetry?.health?.database)}`}>
            {telemetry?.health?.database || 'OK'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ color: 'var(--text-muted)' }}>REDIS:</span>
          <span className={`badge ${getStatusBadgeClass(telemetry?.health?.redis)}`}>
            {telemetry?.health?.redis || 'OK'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ color: 'var(--text-muted)' }}>GATEWAY:</span>
          <span className={`badge ${getStatusBadgeClass(telemetry?.health?.gateway)}`}>
            {telemetry?.health?.gateway || 'OK'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ color: 'var(--text-muted)' }}>PARTICIPANTS:</span>
          <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>
            {telemetry?.activeParticipants ?? '-'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ color: 'var(--text-muted)' }}>TEAMS:</span>
          <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>
            {telemetry?.activeTeams ?? '-'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ color: 'var(--text-muted)' }}>LEADERBOARD v:</span>
          <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>
            {telemetry?.currentLeaderboardVersion ?? '-'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ color: 'var(--text-muted)' }}>SSE:</span>
          <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>
            {telemetry?.sseConnections ?? '-'}
          </span>
        </div>
      </div>
    </header>
  );
};
