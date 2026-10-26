import React, { useEffect, useState } from 'react';
import { Team, Participant } from '../types';
import { useAuth } from '../context/AuthContext';
import { ConfirmModal } from '../components/ConfirmModal';

export const ModerationView: React.FC = () => {
  const { csrfToken } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Modal State
  const [activeModal, setActiveModal] = useState<{
    type: 'ban_user' | 'unban_user' | 'disqualify_team' | 'restore_team';
    id: string;
    name: string;
  } | null>(null);
  const [moderationReason, setModerationReason] = useState('');

  const loadData = async () => {
    try {
      const [tRes, uRes] = await Promise.all([
        fetch('/api/v1/admin/teams'),
        fetch('/api/v1/admin/users'),
      ]);
      if (tRes.ok) {
        const tData = await tRes.json();
        setTeams(tData.teams || (Array.isArray(tData) ? tData : []));
      }
      if (uRes.ok) {
        const uData = await uRes.json();
        setParticipants(uData.users || (Array.isArray(uData) ? uData : []));
      }
    } catch {} finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleExecuteModeration = async () => {
    if (!activeModal) return;
    if (!moderationReason.trim()) {
      setStatusMessage('Error: Mandatory justification reason is required.');
      return;
    }

    const { type, id, name } = activeModal;
    setActiveModal(null);
    setStatusMessage(`Executing moderation enforcement on ${name}...`);

    let url = '';
    if (type === 'ban_user') url = `/api/v1/admin/moderation/users/${id}/ban`;
    if (type === 'unban_user') url = `/api/v1/admin/moderation/users/${id}/unban`;
    if (type === 'disqualify_team') url = `/api/v1/admin/moderation/teams/${id}/disqualify`;
    if (type === 'restore_team') url = `/api/v1/admin/moderation/teams/${id}/restore`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken || '',
        },
        body: JSON.stringify({ reason: moderationReason.trim() }),
      });

      const data = await res.json();
      if (res.ok) {
        setStatusMessage(`✓ Moderation action [${type.toUpperCase()}] enforced successfully for ${name}.`);
        setModerationReason('');
        loadData();
      } else {
        setStatusMessage(`Error: ${data.message || 'Action failed'}`);
      }
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', textTransform: 'uppercase' }}>
          CENTRAL OPERATIONS MODERATION
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
          Enforce immediate account suspension, anti-cheat disqualifications, and audit-logged reinstatement.
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

      {/* Team Moderation Section */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-dim)' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600 }}>
            TEAM INTEGRITY STATUS & DISQUALIFICATION CONTROL
          </span>
        </div>
        <table className="table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th>Status</th>
              <th>Team Name</th>
              <th>Current Score</th>
              <th>Enforcement Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '18px' }}>
                  Loading team rosters...
                </td>
              </tr>
            ) : teams.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '18px' }}>
                  No registered teams found.
                </td>
              </tr>
            ) : (
              teams.map((team) => {
                const isDisqualified = team.status === 'disqualified';
                return (
                  <tr key={team.id}>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background: isDisqualified ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                          color: isDisqualified ? 'var(--status-red)' : 'var(--status-green)',
                          border: `1px solid ${isDisqualified ? 'var(--status-red)' : 'var(--status-green)'}`,
                        }}
                      >
                        {team.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{team.name}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{team.score} pts</td>
                    <td>
                      {isDisqualified ? (
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '11px', color: 'var(--status-green)', borderColor: 'var(--status-green)' }}
                          onClick={() => {
                            setModerationReason('');
                            setActiveModal({
                              type: 'restore_team',
                              id: team.id,
                              name: team.name,
                            });
                          }}
                        >
                          Restore Team Standing
                        </button>
                      ) : (
                        <button
                          className="btn btn-danger"
                          style={{ padding: '4px 10px', fontSize: '11px' }}
                          onClick={() => {
                            setModerationReason('');
                            setActiveModal({
                              type: 'disqualify_team',
                              id: team.id,
                              name: team.name,
                            });
                          }}
                        >
                          Disqualify Team
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Participant Moderation Section */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-dim)' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600 }}>
            PARTICIPANT ACCOUNT STATUS & ACCESS REVOCATION
          </span>
        </div>
        <table className="table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th>Status</th>
              <th>Participant</th>
              <th>Email</th>
              <th>Role</th>
              <th>Enforcement Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '18px' }}>
                  Loading participants...
                </td>
              </tr>
            ) : participants.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '18px' }}>
                  No participants found.
                </td>
              </tr>
            ) : (
              participants.map((user) => {
                const isBanned = user.isActive === false;
                return (
                  <tr key={user.id}>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background: isBanned ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                          color: isBanned ? 'var(--status-red)' : 'var(--status-green)',
                          border: `1px solid ${isBanned ? 'var(--status-red)' : 'var(--status-green)'}`,
                        }}
                      >
                        {isBanned ? 'SUSPENDED' : 'ACTIVE'}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{user.username}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{user.email}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', textTransform: 'uppercase' }}>
                      {user.role}
                    </td>
                    <td>
                      {isBanned ? (
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '11px', color: 'var(--status-green)', borderColor: 'var(--status-green)' }}
                          onClick={() => {
                            setModerationReason('');
                            setActiveModal({
                              type: 'unban_user',
                              id: user.id,
                              name: user.username,
                            });
                          }}
                        >
                          Lift Suspension
                        </button>
                      ) : (
                        <button
                          className="btn btn-danger"
                          style={{ padding: '4px 10px', fontSize: '11px' }}
                          onClick={() => {
                            setModerationReason('');
                            setActiveModal({
                              type: 'ban_user',
                              id: user.id,
                              name: user.username,
                            });
                          }}
                        >
                          Suspend Account
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {activeModal && (
        <ConfirmModal
          isOpen={true}
          title={`Enforce Action: ${activeModal.type.replace('_', ' ').toUpperCase()}`}
          message={`You are modifying operational privileges for "${activeModal.name}".`}
          warningNote="This action is immediately broadcasted and recorded in the append-only audit trail."
          requiredPhrase={
            activeModal.type === 'disqualify_team'
              ? 'DISQUALIFY'
              : activeModal.type === 'ban_user'
              ? 'BAN'
              : undefined
          }
          confirmLabel={`Confirm ${activeModal.type.replace('_', ' ')}`}
          isDestructive={activeModal.type.includes('ban') || activeModal.type.includes('disqualify')}
          onConfirm={handleExecuteModeration}
          onCancel={() => setActiveModal(null)}
        />
      )}
    </div>
  );
};
