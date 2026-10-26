import React, { useEffect, useState } from 'react';
import { Team } from '../types';
import { ConfirmModal } from '../components/ConfirmModal';
import { useAuth } from '../context/AuthContext';

export const TeamsView: React.FC = () => {
  const { csrfToken } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [search, setSearch] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  // Rename Modal
  const [renameModal, setRenameModal] = useState<{ isOpen: boolean; team: Team | null; newName: string }>({
    isOpen: false,
    team: null,
    newName: '',
  });

  // Action Confirmation Modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    requiredPhrase?: string;
    warningNote?: string;
    action: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    action: async () => {},
  });

  const fetchTeams = async () => {
    try {
      const res = await fetch('/api/v1/admin/teams');
      if (res.ok) {
        const json = await res.json();
        setTeams(json);
      }
    } catch {} finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTeams();
  }, []);

  const fetchTeamDetails = async (team: Team) => {
    setSelectedTeam(team);
    try {
      const res = await fetch(`/api/v1/admin/teams/${team.id}/members`);
      if (res.ok) {
        const json = await res.json();
        setTeamMembers(json);
      }
    } catch {
      setTeamMembers([]);
    }
  };

  const setStatus = async (teamId: string, status: string, reason: string) => {
    try {
      const res = await fetch(`/api/v1/admin/teams/${teamId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken || '',
        },
        body: JSON.stringify({ status, reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.message || 'Status change failed', isError: true });
      } else {
        setMessage({ text: `Team status set to ${status}` });
        fetchTeams();
        if (selectedTeam && selectedTeam.id === teamId) {
          setSelectedTeam({ ...selectedTeam, status: status as any });
        }
      }
    } catch (err: any) {
      setMessage({ text: err.message, isError: true });
    }
  };

  const handleRename = async () => {
    if (!renameModal.team || !renameModal.newName.trim()) return;
    try {
      const res = await fetch(`/api/v1/admin/teams/${renameModal.team.id}/rename`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken || '',
        },
        body: JSON.stringify({ name: renameModal.newName.trim(), reason: 'Admin rename' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.message || 'Rename failed', isError: true });
      } else {
        setMessage({ text: `Team renamed to ${renameModal.newName.trim()}` });
        setRenameModal({ isOpen: false, team: null, newName: '' });
        fetchTeams();
      }
    } catch (err: any) {
      setMessage({ text: err.message, isError: true });
    }
  };

  const filteredTeams = teams.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) || t.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', textTransform: 'uppercase' }}>
            TEAMS CONTROL & MODERATION
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
            Inspect team state, rosters, scores, and execute non-destructive moderation actions.
          </p>
        </div>
        <button onClick={() => fetchTeams()} className="btn btn-secondary">
          REFRESH TEAMS
        </button>
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

      {/* Filter and Search */}
      <div style={{ display: 'flex', gap: '12px' }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by team name or UUID..."
          style={{ maxWidth: '360px', fontFamily: 'var(--font-mono)' }}
        />
      </div>

      {/* Main Grid: Team Table & Detail Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedTeam ? '1fr 400px' : '1fr', gap: '20px' }}>
        {/* Teams Table */}
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>TEAM NAME</th>
                <th>SCORE</th>
                <th>STATUS</th>
                <th>CREATED AT</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredTeams.map((t) => (
                <tr
                  key={t.id}
                  style={{
                    background: selectedTeam?.id === t.id ? 'var(--bg-hover)' : undefined,
                    cursor: 'pointer',
                  }}
                  onClick={() => fetchTeamDetails(t)}
                >
                  <td style={{ fontWeight: 600 }}>{t.name}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>
                    {t.score} PTS
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        t.status === 'active'
                          ? 'badge-green'
                          : t.status === 'disqualified'
                          ? 'badge-red'
                          : 'badge-amber'
                      }`}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
                    {new Date(t.createdAt).toLocaleDateString()}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '3px 7px', fontSize: '10px' }}
                        onClick={() => fetchTeamDetails(t)}
                      >
                        VIEW
                      </button>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '3px 7px', fontSize: '10px' }}
                        onClick={() => setRenameModal({ isOpen: true, team: t, newName: t.name })}
                      >
                        RENAME
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredTeams.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                    No teams found matching search criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Selected Team Sidebar Drawer */}
        {selectedTeam && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="card-header">
              <span className="card-title">TEAM DOSSIER</span>
              <button
                className="btn btn-secondary"
                style={{ padding: '2px 6px', fontSize: '10px' }}
                onClick={() => setSelectedTeam(null)}
              >
                CLOSE
              </button>
            </div>

            <div>
              <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>
                {selectedTeam.name}
              </div>
              <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                ID: {selectedTeam.id}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <span className="form-label">SCORE</span>
                <span style={{ fontSize: '16px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                  {selectedTeam.score} PTS
                </span>
              </div>
              <div>
                <span className="form-label">STATUS</span>
                <span
                  className={`badge ${
                    selectedTeam.status === 'active'
                      ? 'badge-green'
                      : selectedTeam.status === 'disqualified'
                      ? 'badge-red'
                      : 'badge-amber'
                  }`}
                >
                  {selectedTeam.status}
                </span>
              </div>
            </div>

            {/* Roster */}
            <div>
              <span className="form-label">ROSTER ({teamMembers.length}/4)</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                {teamMembers.map((m) => (
                  <div
                    key={m.userId || m.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '6px 8px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-dim)',
                      borderRadius: '3px',
                      fontSize: '11px',
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600 }}>{m.username || m.name}</span>
                      <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>({m.email})</span>
                    </div>
                    <span className="badge badge-gray">{m.role || 'member'}</span>
                  </div>
                ))}
                {teamMembers.length === 0 && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No members found.</div>
                )}
              </div>
            </div>

            {/* Moderation Controls */}
            <div>
              <span className="form-label">OPERATIONS & MODERATION</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                {selectedTeam.status === 'active' ? (
                  <>
                    <button
                      className="btn btn-secondary"
                      onClick={() =>
                        setConfirmModal({
                          isOpen: true,
                          title: 'DISABLE TEAM',
                          message: `Are you sure you want to disable team "${selectedTeam.name}"? They will not be able to log in or submit flags.`,
                          action: () => setStatus(selectedTeam.id, 'disabled', 'Admin disabled team'),
                        })
                      }
                    >
                      DISABLE TEAM
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={() =>
                        setConfirmModal({
                          isOpen: true,
                          title: 'DISQUALIFY TEAM',
                          message: `Are you sure you want to disqualify team "${selectedTeam.name}"? This is a severe punitive action.`,
                          requiredPhrase: 'DISQUALIFY',
                          warningNote: 'Disqualified teams appear flagged on the official record.',
                          action: () => setStatus(selectedTeam.id, 'disqualified', 'Admin disqualified team'),
                        })
                      }
                    >
                      DISQUALIFY TEAM
                    </button>
                  </>
                ) : (
                  <button
                    className="btn btn-success"
                    onClick={() =>
                      setConfirmModal({
                        isOpen: true,
                        title: 'RESTORE TEAM',
                        message: `Restore team "${selectedTeam.name}" to active standing?`,
                        action: () => setStatus(selectedTeam.id, 'active', 'Admin restored team to active status'),
                      })
                    }
                  >
                    RESTORE TO ACTIVE
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Rename Modal */}
      {renameModal.isOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', marginBottom: '12px' }}>
              RENAME TEAM
            </h3>
            <div className="form-group">
              <label className="form-label">New Team Name</label>
              <input
                type="text"
                value={renameModal.newName}
                onChange={(e) => setRenameModal({ ...renameModal, newName: e.target.value })}
                required
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setRenameModal({ isOpen: false, team: null, newName: '' })}
              >
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleRename}>
                Save Name
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        requiredPhrase={confirmModal.requiredPhrase}
        warningNote={confirmModal.warningNote}
        onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        onConfirm={async () => {
          setConfirmModal({ ...confirmModal, isOpen: false });
          await confirmModal.action();
        }}
      />
    </div>
  );
};
