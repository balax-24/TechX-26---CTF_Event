import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ConfirmModal } from '../components/ConfirmModal';

export const EmergencyControlsView: React.FC = () => {
  const { csrfToken } = useAuth();
  const [compState, setCompState] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Modal State
  const [pendingAction, setPendingAction] = useState<{
    action: 'pause' | 'resume' | 'disable_submissions' | 'enable_submissions' | 'maintenance';
    title: string;
    description: string;
    phrase: string;
  } | null>(null);
  const [reason, setReason] = useState('');

  const fetchState = async () => {
    try {
      const res = await fetch('/api/v1/admin/competition/state');
      if (res.ok) {
        const data = await res.json();
        setCompState(data);
      }
    } catch {} finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchState();
  }, []);

  const handleExecuteEmergency = async () => {
    if (!pendingAction) return;
    if (!reason.trim()) {
      setStatusMessage('Error: Emergency justification reason is strictly mandatory for operations audit.');
      return;
    }

    const { action } = pendingAction;
    setPendingAction(null);
    setStatusMessage(`EXECUTING EMERGENCY ACTION: [${action.toUpperCase()}]...`);

    try {
      const res = await fetch(`/api/v1/admin/emergency/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken || '',
        },
        body: JSON.stringify({ reason: reason.trim() }),
      });

      const data = await res.json();
      if (res.ok) {
        setStatusMessage(`✓ EMERGENCY DIRECTIVE [${action.toUpperCase()}] EXECUTED. Global broadcast dispatched.`);
        setReason('');
        fetchState();
      } else {
        setStatusMessage(`Emergency Action Rejected: ${data.message || 'Backend execution failure'}`);
      }
    } catch (err: any) {
      setStatusMessage(`Emergency Execution Error: ${err.message}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* High-visibility Warning Header */}
      <div
        style={{
          border: '1px solid rgba(239, 68, 68, 0.4)',
          background: 'rgba(239, 68, 68, 0.08)',
          borderRadius: '4px',
          padding: '16px 20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <span
            style={{
              background: 'var(--status-red)',
              color: '#fff',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '2px',
            }}
          >
            RESTRICTED AIR-GAP CONSOLE
          </span>
          <h2 style={{ fontSize: '16px', fontFamily: 'var(--font-mono)', color: 'var(--status-red)', margin: 0 }}>
            EMERGENCY KILL-SWITCHES & COMPETITION HALT
          </h2>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-primary)', margin: 0 }}>
          Direct kernel interventions into the CTF event loop. Actions executed here take immediate effect across all participant websockets and API gateways.
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

      {/* Live State Card */}
      <div className="card">
        <h3 style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: '14px' }}>
          CURRENT EVENT EXECUTION STATE
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
          <div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>STATE</span>
            <div>
              <span
                className="badge"
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  background:
                    compState?.state === 'live'
                      ? 'rgba(34, 197, 94, 0.2)'
                      : compState?.state === 'paused'
                      ? 'rgba(239, 68, 68, 0.2)'
                      : 'rgba(234, 179, 8, 0.2)',
                  color:
                    compState?.state === 'live'
                      ? 'var(--status-green)'
                      : compState?.state === 'paused'
                      ? 'var(--status-red)'
                      : 'var(--status-amber)',
                  border: `1px solid ${
                    compState?.state === 'live'
                      ? 'var(--status-green)'
                      : compState?.state === 'paused'
                      ? 'var(--status-red)'
                      : 'var(--status-amber)'
                  }`,
                }}
              >
                {(compState?.state || 'UNKNOWN').toUpperCase()}
              </span>
            </div>
          </div>

          <div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>SUBMISSIONS ADMISSIBLE</span>
            <div style={{ fontSize: '14px', fontWeight: 600, color: compState?.isSubmissionEnabled ? 'var(--status-green)' : 'var(--status-red)' }}>
              {compState?.isSubmissionEnabled ? '● ACCEPTING SUBMISSIONS' : '✕ SUBMISSIONS REJECTED'}
            </div>
          </div>

          <div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>FREEZE POSTURE</span>
            <div style={{ fontSize: '14px', fontWeight: 600, color: compState?.isScoreboardFrozen ? 'var(--status-amber)' : 'var(--accent-cyan)' }}>
              {compState?.isScoreboardFrozen ? 'SCOREBOARD FROZEN' : 'REAL-TIME BROADCAST'}
            </div>
          </div>
        </div>
      </div>

      {/* Mandatory Reason Input */}
      <div className="card" style={{ borderColor: 'var(--border-dim)' }}>
        <label className="form-label" style={{ color: 'var(--status-red)' }}>
          MANDATORY OPERATIONAL JUSTIFICATION FOR EMERGENCY DIRECTIVE
        </label>
        <input
          type="text"
          placeholder="e.g. Unscheduled network outage at main venue / Suspected global platform zero-day..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
        />
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
          This justification will be permanently written to the audit log and broadcasted in emergency notifications.
        </span>
      </div>

      {/* Emergency Control Panels Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        {/* Pause Event */}
        <div className="card" style={{ borderTop: '3px solid var(--status-red)' }}>
          <h4 style={{ fontSize: '14px', color: 'var(--status-red)', fontFamily: 'var(--font-mono)', marginBottom: '8px' }}>
            [HALT] PAUSE COMPETITION
          </h4>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Immediately freezes timer, locks participant submissions, and puts challenge containers in freeze state.
          </p>
          <button
            className="btn btn-danger"
            style={{ width: '100%' }}
            disabled={!reason.trim() || compState?.state === 'paused'}
            onClick={() =>
              setPendingAction({
                action: 'pause',
                title: 'EMERGENCY: PAUSE COMPETITION',
                description: 'This will immediately freeze the entire CTF event. No participants can submit flags or progress.',
                phrase: 'PAUSE EVENT',
              })
            }
          >
            Pause Entire Competition
          </button>
        </div>

        {/* Resume Event */}
        <div className="card" style={{ borderTop: '3px solid var(--status-green)' }}>
          <h4 style={{ fontSize: '14px', color: 'var(--status-green)', fontFamily: 'var(--font-mono)', marginBottom: '8px' }}>
            [RESTORE] RESUME COMPETITION
          </h4>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Re-enables live competition state, unfreezes scoring pipeline, and opens flag submission gateways.
          </p>
          <button
            className="btn btn-primary"
            style={{ width: '100%', background: 'var(--status-green)', borderColor: 'var(--status-green)', color: '#000' }}
            disabled={!reason.trim() || compState?.state === 'live'}
            onClick={() =>
              setPendingAction({
                action: 'resume',
                title: 'RESUME COMPETITION',
                description: 'This will restore the CTF to active live state across all nodes.',
                phrase: 'RESUME EVENT',
              })
            }
          >
            Resume Live Competition
          </button>
        </div>

        {/* Disable Submissions */}
        <div className="card" style={{ borderTop: '3px solid var(--status-amber)' }}>
          <h4 style={{ fontSize: '14px', color: 'var(--status-amber)', fontFamily: 'var(--font-mono)', marginBottom: '8px' }}>
            [REJECT] DISABLE SUBMISSIONS
          </h4>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Allows participants to view challenges and read instructions, but rejects any flag verification requests.
          </p>
          <button
            className="btn btn-danger"
            style={{ width: '100%', background: 'rgba(234, 179, 8, 0.2)', borderColor: 'var(--status-amber)', color: 'var(--status-amber)' }}
            disabled={!reason.trim() || compState?.isSubmissionEnabled === false}
            onClick={() =>
              setPendingAction({
                action: 'disable_submissions',
                title: 'EMERGENCY: DISABLE ALL SUBMISSIONS',
                description: 'Flag submission gateway will return 400 SUBMISSIONS_DISABLED for all teams.',
                phrase: 'DISABLE SUBMISSIONS',
              })
            }
          >
            Lock Flag Submissions
          </button>
        </div>

        {/* Enable Submissions */}
        <div className="card" style={{ borderTop: '3px solid var(--accent-cyan)' }}>
          <h4 style={{ fontSize: '14px', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', marginBottom: '8px' }}>
            [ACCEPT] ENABLE SUBMISSIONS
          </h4>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Opens the flag verification pipeline so participants can submit flags and receive score credit.
          </p>
          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={!reason.trim() || compState?.isSubmissionEnabled === true}
            onClick={() =>
              setPendingAction({
                action: 'enable_submissions',
                title: 'ENABLE FLAG SUBMISSIONS',
                description: 'Submissions gateway will immediately begin verifying flags from all teams.',
                phrase: 'ENABLE SUBMISSIONS',
              })
            }
          >
            Unlock Flag Submissions
          </button>
        </div>
      </div>

      {pendingAction && (
        <ConfirmModal
          isOpen={true}
          title={pendingAction.title}
          message={pendingAction.description}
          warningNote={`Enforcing with justification: "${reason}"`}
          requiredPhrase={pendingAction.phrase}
          confirmLabel="Authorize Directive"
          isDestructive={true}
          onConfirm={handleExecuteEmergency}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </div>
  );
};
