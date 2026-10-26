import React, { useEffect, useState } from 'react';

interface HealthData {
  overall: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  components: {
    server: {
      status: string;
      uptimeSeconds: number;
      memory: {
        rss: number;
        heapTotal: number;
        heapUsed: number;
        external: number;
      };
      nodeVersion: string;
    };
    database: {
      status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
      latencyMs: number;
    };
    redis: {
      status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
      latencyMs: number;
    };
    gateway: {
      status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
    };
    outbox: {
      pendingCount: number;
      status: 'HEALTHY' | 'DEGRADED';
    };
    dynamicRuntime: {
      activeInstances: number;
    };
  };
  timestamp: string;
}

export const SystemHealthView: React.FC = () => {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastCheckTime, setLastCheckTime] = useState<string>('');

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/v1/admin/system/health');
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
        setLastCheckTime(new Date().toLocaleTimeString());
      }
    } catch {} finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  const formatUptime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs}h ${mins}m ${secs}s`;
  };

  const formatMB = (bytes: number) => {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', textTransform: 'uppercase' }}>
            INFRASTRUCTURE HEALTH & SUBSYSTEM DIAGNOSTICS
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
            Continuous low-overhead telemetry probes for PostgreSQL, Redis, Challenge Gateway, and Node runtime.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            Polling interval: 5s | Last probed: {lastCheckTime || '—'}
          </span>
          <button className="btn btn-secondary" onClick={fetchHealth}>
            Probe Now
          </button>
        </div>
      </div>

      {isLoading && !health ? (
        <div className="card" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
          Executing deep subsystem health checks...
        </div>
      ) : !health ? (
        <div className="card" style={{ borderLeft: '3px solid var(--status-red)', color: 'var(--status-red)' }}>
          Failed to retrieve subsystem health telemetry from admin backend.
        </div>
      ) : (
        <>
          {/* Top Status Banner */}
          <div
            className="card"
            style={{
              borderLeft: `4px solid ${
                health.overall === 'HEALTHY' ? 'var(--status-green)' : 'var(--status-amber)'
              }`,
              background:
                health.overall === 'HEALTHY'
                  ? 'rgba(34, 197, 94, 0.05)'
                  : 'rgba(234, 179, 8, 0.05)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
                GLOBAL SYSTEM POSTURE
              </span>
              <div
                style={{
                  fontSize: '20px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  color: health.overall === 'HEALTHY' ? 'var(--status-green)' : 'var(--status-amber)',
                }}
              >
                ● {health.overall} OPERATIONAL
              </div>
            </div>

            <div style={{ display: 'flex', gap: '20px', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Fastify Uptime: </span>
                <span style={{ fontWeight: 600 }}>{formatUptime(health.components.server.uptimeSeconds)}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Runtime: </span>
                <span style={{ fontWeight: 600 }}>Node {health.components.server.nodeVersion}</span>
              </div>
            </div>
          </div>

          {/* Subsystem Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
            {/* Database Card */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  POSTGRESQL CLUSTER
                </span>
                <span
                  className="badge"
                  style={{
                    background:
                      health.components.database.status === 'HEALTHY'
                        ? 'rgba(34, 197, 94, 0.15)'
                        : 'rgba(239, 68, 68, 0.15)',
                    color:
                      health.components.database.status === 'HEALTHY'
                        ? 'var(--status-green)'
                        : 'var(--status-red)',
                  }}
                >
                  {health.components.database.status}
                </span>
              </div>
              <div style={{ fontSize: '18px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                {health.components.database.latencyMs} ms
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Round-trip query latency (authoritative ledger)
              </span>
            </div>

            {/* Redis Card */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  REDIS 7 CACHE & PUBSUB
                </span>
                <span
                  className="badge"
                  style={{
                    background:
                      health.components.redis.status === 'HEALTHY'
                        ? 'rgba(34, 197, 94, 0.15)'
                        : 'rgba(239, 68, 68, 0.15)',
                    color:
                      health.components.redis.status === 'HEALTHY'
                        ? 'var(--status-green)'
                        : 'var(--status-red)',
                  }}
                >
                  {health.components.redis.status}
                </span>
              </div>
              <div style={{ fontSize: '18px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                {health.components.redis.latencyMs} ms
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                PING round-trip latency & SSE event channel
              </span>
            </div>

            {/* Challenge Gateway Card */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  CHALLENGE GATEWAY
                </span>
                <span
                  className="badge"
                  style={{
                    background:
                      health.components.gateway.status === 'HEALTHY'
                        ? 'rgba(34, 197, 94, 0.15)'
                        : 'rgba(234, 179, 8, 0.15)',
                    color:
                      health.components.gateway.status === 'HEALTHY'
                        ? 'var(--status-green)'
                        : 'var(--status-amber)',
                  }}
                >
                  {health.components.gateway.status}
                </span>
              </div>
              <div style={{ fontSize: '18px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                HTTP Probed
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Container socket router & port manager (internal)
              </span>
            </div>

            {/* Outbox Event Queue Card */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  SCORE EVENT OUTBOX
                </span>
                <span
                  className="badge"
                  style={{
                    background:
                      health.components.outbox.status === 'HEALTHY'
                        ? 'rgba(34, 197, 94, 0.15)'
                        : 'rgba(234, 179, 8, 0.15)',
                    color:
                      health.components.outbox.status === 'HEALTHY'
                        ? 'var(--status-green)'
                        : 'var(--status-amber)',
                  }}
                >
                  {health.components.outbox.status}
                </span>
              </div>
              <div style={{ fontSize: '18px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                {health.components.outbox.pendingCount} Pending
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Asynchronous transactional ledger sync buffer
              </span>
            </div>
          </div>

          {/* Process Memory Telemetry Card */}
          <div className="card">
            <h3 style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: '14px' }}>
              PROCESS RUNTIME MEMORY ALLOCATION
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px' }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  RESIDENT SET (RSS)
                </span>
                <div style={{ fontSize: '16px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>
                  {formatMB(health.components.server.memory.rss)}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  HEAP TOTAL
                </span>
                <div style={{ fontSize: '16px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  {formatMB(health.components.server.memory.heapTotal)}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  HEAP USED
                </span>
                <div style={{ fontSize: '16px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--status-green)' }}>
                  {formatMB(health.components.server.memory.heapUsed)}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  ACTIVE CONTAINERS
                </span>
                <div style={{ fontSize: '16px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>
                  {health.components.dynamicRuntime.activeInstances}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
