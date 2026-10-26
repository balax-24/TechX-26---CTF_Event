import React, { useEffect, useState } from 'react';
import { ConfirmModal } from '../components/ConfirmModal';
import { useAuth } from '../context/AuthContext';

export const EventControlView: React.FC = () => {
  const { csrfToken } = useAuth();
  const [compState, setCompState] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  // Modal states
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    warningNote?: string;
    requiredPhrase?: string;
    targetState: string;
  }>({
    isOpen: false,
    title: '',
    description: '',
    targetState: '',
  });

  const fetchState = async () => {
    try {
      const res = await fetch('/api/v1/admin/competition/state');
      if (res.ok) {
        const json = await res.json();
        setCompState(json);
      }
    } catch {} finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchState();
  }, []);

  const handleTransition = async (targetState: string, reason: string) => {
    try {
      const res = await fetch('/api/v1/admin/competition/transition', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken || '',
        },
        body: JSON.stringify({ targetState, reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.message || 'Transition rejected', isError: true });
      } else {
        setMessage({ text: `Competition successfully transitioned to ${targetState.toUpperCase()}` });
        fetchState();
      }
    } catch (err: any) {
      setMessage({ text: err.message || 'Network error', isError: true });
    }
  };

  const handleUpdateSchedule = async (startTime: string, endTime: string, label: string) => {
    try {
      const res = await fetch('/api/v1/admin/competition/config', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken || '',
        },
        body: JSON.stringify({
          startTime,
          endTime,
          reason: `Admin updated event schedule: ${label}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.message || 'Failed to update schedule', isError: true });
      } else {
        setMessage({ text: `Schedule updated: ${label}` });
        fetchState();
      }
    } catch (err: any) {
      setMessage({ text: err.message || 'Network error updating schedule', isError: true });
    }
  };

  const openConfirm = (
    title: string,
    targetState: string,
    description: string,
    requiredPhrase?: string,
    warningNote?: string
  ) => {
    setModalConfig({
      isOpen: true,
      title,
      targetState,
      description,
      requiredPhrase,
      warningNote,
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', textTransform: 'uppercase' }}>
          COMPETITION EVENT CONTROL PLANE
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
          Server-authoritative competition lifecycle controls. Destructive actions require cryptographic CSRF validation and explicit typed authorization.
        </p>
      </div>

      {message && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '3px',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            background: message.isError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
            border: `1px solid ${message.isError ? 'var(--status-red)' : 'var(--status-green)'}`,
            color: message.isError ? '#f87171' : 'var(--status-green)',
          }}
        >
          {message.text}
        </div>
      )}

      {/* State Display Card */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">CURRENT COMPETITION STATE</span>
          <span className="badge badge-cyan">{compState?.state ? compState.state.toUpperCase() : 'UNKNOWN'}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>NAME</div>
            <div style={{ fontSize: '14px', fontWeight: 600, marginTop: '4px' }}>{compState?.name || 'TechX CTF 2026'}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>STATE</div>
            <div style={{ fontSize: '14px', fontWeight: 600, marginTop: '4px', color: 'var(--accent-cyan)' }}>
              {compState?.state ? compState.state.toUpperCase() : '-'}
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>SUBMISSIONS ENABLED</div>
            <div style={{ fontSize: '14px', fontWeight: 600, marginTop: '4px' }}>
              {compState?.isSubmissionEnabled ? 'YES (Active)' : 'NO (Disabled)'}
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>START TIME</div>
            <div style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
              {compState?.startTime ? new Date(compState.startTime).toLocaleString() : 'Not Set'}
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>END TIME</div>
            <div style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
              {compState?.endTime ? new Date(compState.endTime).toLocaleString() : 'Not Set'}
            </div>
          </div>
        </div>
      </div>

      {/* Competition Timer & Schedule Configuration */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">EVENT COUNTDOWN & TIMER SCHEDULE (TODAY, OCT 14)</span>
          <span className="badge badge-cyan">ASIA/KOLKATA (IST)</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: 0 }}>
            Configure authoritative start and end times for the participant live countdown timer. 
            Before start time, participants see a <strong>STARTS IN</strong> countdown. At start time, it turns <strong>LIVE</strong>. At end time, the timer automatically turns <strong>ENDED</strong>.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
            <div style={{ padding: '12px', background: 'var(--bg-card)', borderRadius: '4px', border: '1px solid #1e2c40' }}>
              <div style={{ color: 'var(--accent-cyan)', fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                SCHEDULED START TIME
              </div>
              <div style={{ fontSize: '14px', fontWeight: 600, marginTop: '6px' }}>
                {compState?.startTime ? new Date(compState.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : 'Not Set'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                {compState?.startTime ? new Date(compState.startTime).toISOString() : '-'}
              </div>
            </div>

            <div style={{ padding: '12px', background: 'var(--bg-card)', borderRadius: '4px', border: '1px solid #1e2c40' }}>
              <div style={{ color: 'var(--accent-cyan)', fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                SCHEDULED END TIME
              </div>
              <div style={{ fontSize: '14px', fontWeight: 600, marginTop: '6px' }}>
                {compState?.endTime ? new Date(compState.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : 'Not Set'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                {compState?.endTime ? new Date(compState.endTime).toISOString() : '-'}
              </div>
            </div>
          </div>

          {/* Start Delay Controls */}
          <div>
            <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 700 }}>
              START CONTROLS (DELAY / GO LIVE):
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
              <button
                onClick={() => {
                  const currentStart = new Date(compState?.startTime || '2026-10-14T05:00:00.000Z').getTime();
                  const currentEnd = new Date(compState?.endTime || '2026-10-14T07:30:00.000Z').getTime();
                  const newStart = new Date(currentStart + 15 * 60 * 1000).toISOString();
                  const newEnd = new Date(currentEnd + 15 * 60 * 1000).toISOString();
                  handleUpdateSchedule(newStart, newEnd, 'Delayed Start by +15 Minutes');
                }}
                className="btn btn-secondary"
                style={{ fontSize: '12px', padding: '8px 14px' }}
              >
                ⏱ DELAY START +15 MINS
              </button>

              <button
                onClick={() => {
                  const currentStart = new Date(compState?.startTime || '2026-10-14T05:00:00.000Z').getTime();
                  const currentEnd = new Date(compState?.endTime || '2026-10-14T07:30:00.000Z').getTime();
                  const newStart = new Date(currentStart + 30 * 60 * 1000).toISOString();
                  const newEnd = new Date(currentEnd + 30 * 60 * 1000).toISOString();
                  handleUpdateSchedule(newStart, newEnd, 'Delayed Start by +30 Minutes');
                }}
                className="btn btn-secondary"
                style={{ fontSize: '12px', padding: '8px 14px' }}
              >
                ⏱ DELAY START +30 MINS
              </button>

              <button
                onClick={() => {
                  const nowIso = new Date().toISOString();
                  const currentEnd = compState?.endTime || '2026-10-14T07:30:00.000Z';
                  handleUpdateSchedule(nowIso, currentEnd, 'Started Immediately (Go Live Now)');
                }}
                className="btn btn-success"
                style={{ fontSize: '12px', padding: '8px 14px' }}
              >
                🚀 GO LIVE IMMEDIATELY (START NOW)
              </button>
            </div>
          </div>

          {/* End Time / Extension Controls */}
          <div>
            <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 700 }}>
              END TIME / EXTENSION CONTROLS:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
              <button
                onClick={() => handleUpdateSchedule('2026-10-14T05:00:00.000Z', '2026-10-14T07:30:00.000Z', 'Set End Time to 1:00 PM (13:00 IST)')}
                className="btn btn-primary"
                style={{ fontSize: '12px', padding: '8px 14px' }}
              >
                SET END: 1:00 PM (13:00 IST)
              </button>

              <button
                onClick={() => handleUpdateSchedule('2026-10-14T05:00:00.000Z', '2026-10-14T07:15:00.000Z', 'Set End Time to 12:45 PM (12:45 IST)')}
                className="btn btn-secondary"
                style={{ fontSize: '12px', padding: '8px 14px' }}
              >
                SET END: 12:45 PM (12:45 IST)
              </button>

              {compState?.endTime && (
                <>
                  <button
                    onClick={() => {
                      const currentEnd = new Date(compState.endTime).getTime();
                      const newEnd = new Date(currentEnd + 15 * 60 * 1000).toISOString();
                      const start = compState.startTime || '2026-10-14T05:00:00.000Z';
                      handleUpdateSchedule(start, newEnd, '+15 Minutes Extension');
                    }}
                    className="btn btn-outline"
                    style={{ fontSize: '12px', padding: '8px 12px' }}
                  >
                    +15 MINS EXTENSION
                  </button>

                  <button
                    onClick={() => {
                      const currentEnd = new Date(compState.endTime).getTime();
                      const newEnd = new Date(currentEnd + 30 * 60 * 1000).toISOString();
                      const start = compState.startTime || '2026-10-14T05:00:00.000Z';
                      handleUpdateSchedule(start, newEnd, '+30 Minutes Extension');
                    }}
                    className="btn btn-outline"
                    style={{ fontSize: '12px', padding: '8px 12px' }}
                  >
                    +30 MINS EXTENSION
                  </button>
                </>
              )}

              <button
                onClick={() => openConfirm('END EVENT', 'ended', 'This will conclude contest play immediately, lock all submissions, and stop the live countdown.', 'END EVENT', 'Submissions will no longer be accepted.')}
                className="btn btn-danger"
                style={{ fontSize: '12px', padding: '8px 14px' }}
              >
                🛑 MANUALLY END EVENT NOW
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Action Controls Card */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">LIFECYCLE TRANSITION CONTROLS</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* START / RESUME */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-card)', borderRadius: '4px' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '13px' }}>START COMPETITION (GO LIVE)</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Transitions tournament to LIVE state and enables participant submissions and leaderboard scoring.
              </div>
            </div>
            <button
              onClick={() => openConfirm('START EVENT', 'live', 'This will start the competition and open challenge submissions to all active participants.')}
              className="btn btn-success"
              disabled={compState?.state === 'live'}
            >
              START EVENT
            </button>
          </div>

          {/* PAUSE */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-card)', borderRadius: '4px' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '13px' }}>PAUSE COMPETITION</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Freezes the clock and stops participant flag evaluations. All active teams will see the PAUSED state.
              </div>
            </div>
            <button
              onClick={() => openConfirm('PAUSE EVENT', 'paused', 'This will prevent participant scoring/submissions according to the existing lifecycle rules.', 'PAUSE EVENT', 'Participant scoring will be halted instantly.')}
              className="btn btn-danger"
              disabled={compState?.state === 'paused'}
            >
              PAUSE EVENT
            </button>
          </div>

          {/* RESUME */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-card)', borderRadius: '4px' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '13px' }}>RESUME COMPETITION</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Resumes a paused tournament, unfreezing scoring and submissions.
              </div>
            </div>
            <button
              onClick={() => openConfirm('RESUME EVENT', 'live', 'This will resume tournament scoring and submissions for all participants.')}
              className="btn btn-cyan"
              disabled={compState?.state !== 'paused'}
            >
              RESUME EVENT
            </button>
          </div>

          {/* END */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-card)', borderRadius: '4px' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '13px' }}>END COMPETITION</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Concludes official contest play. Submissions are permanently closed and final rankings locked.
              </div>
            </div>
            <button
              onClick={() => openConfirm('END EVENT', 'ended', 'This will formally conclude the tournament and lock participant submissions.', 'END EVENT', 'Submissions will no longer be accepted.')}
              className="btn btn-danger"
              disabled={compState?.state === 'ended' || compState?.state === 'archived'}
            >
              END EVENT
            </button>
          </div>

          {/* ARCHIVE */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-card)', borderRadius: '4px' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '13px' }}>ARCHIVE COMPETITION</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Puts event into read-only archive mode.
              </div>
            </div>
            <button
              onClick={() => openConfirm('ARCHIVE EVENT', 'archived', 'This will archive the event in read-only mode.', 'ARCHIVE EVENT')}
              className="btn btn-secondary"
              disabled={compState?.state === 'archived'}
            >
              ARCHIVE EVENT
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={modalConfig.isOpen}
        title={modalConfig.title}
        message={modalConfig.description}
        warningNote={modalConfig.warningNote}
        requiredPhrase={modalConfig.requiredPhrase}
        onCancel={() => setModalConfig({ ...modalConfig, isOpen: false })}
        onConfirm={() => {
          setModalConfig({ ...modalConfig, isOpen: false });
          handleTransition(modalConfig.targetState, `Admin performed ${modalConfig.title}`);
        }}
      />
    </div>
  );
};
