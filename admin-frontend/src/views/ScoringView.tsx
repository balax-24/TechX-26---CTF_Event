import React, { useEffect, useState } from 'react';
import { ScoreLedgerEntry, Team } from '../types';
import { useAuth } from '../context/AuthContext';
import { ConfirmModal } from '../components/ConfirmModal';

export const ScoringView: React.FC = () => {
  const { csrfToken } = useAuth();
  const [ledger, setLedger] = useState<ScoreLedgerEntry[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Adjustment Form State
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [deltaPoints, setDeltaPoints] = useState<number | ''>('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const fetchLedger = async (targetPage = 1) => {
    try {
      const res = await fetch(`/api/v1/admin/scores/ledger?page=${targetPage}&limit=25`);
      if (res.ok) {
        const data = await res.json();
        setLedger(data.entries || []);
        setTotalCount(data.total || 0);
        setPage(targetPage);
      }
    } catch {} finally {
      setIsLoading(false);
    }
  };

  const fetchTeams = async () => {
    try {
      const res = await fetch('/api/v1/admin/teams');
      if (res.ok) {
        const data = await res.json();
        setTeams(data.teams || (Array.isArray(data) ? data : []));
      }
    } catch {}
  };

  useEffect(() => {
    fetchLedger(1);
    fetchTeams();
  }, []);

  const handlePreSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeamId || deltaPoints === '' || !adjustmentReason.trim()) {
      setStatusMessage('Error: All adjustment parameters (Team, Delta Points, and Audit Reason) are required.');
      return;
    }
    if (adjustmentReason.trim().length < 5) {
      setStatusMessage('Error: Audit justification reason must be at least 5 characters long.');
      return;
    }
    // High-impact adjustments trigger confirmation modal
    if (Math.abs(Number(deltaPoints)) >= 50 || Number(deltaPoints) < 0) {
      setShowConfirmModal(true);
    } else {
      executeScoreAdjustment();
    }
  };

  const executeScoreAdjustment = async () => {
    setShowConfirmModal(false);
    setIsSubmitting(true);
    setStatusMessage(null);

    const idempotencyKey = `adj_${selectedTeamId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    try {
      const res = await fetch(`/api/v1/admin/teams/${selectedTeamId}/adjust-score`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken || '',
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({
          delta: Number(deltaPoints),
          reason: adjustmentReason.trim(),
          idempotencyKey,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setStatusMessage(`✓ Score adjustment successful. Ledger event recorded with delta ${Number(deltaPoints) > 0 ? '+' : ''}${deltaPoints} pts.`);
        setDeltaPoints('');
        setAdjustmentReason('');
        fetchLedger(1);
        fetchTeams();
      } else {
        setStatusMessage(`Error: ${data.message || 'Score adjustment rejected by backend'}`);
      }
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedTeamName = teams.find((t) => t.id === selectedTeamId)?.name || 'Selected Team';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', textTransform: 'uppercase' }}>
          SCORING ENGINE & AUTHORITATIVE LEDGER
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
          Cryptographically immutable, append-only score events log and verified manual adjustment console.
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

      {/* Manual Score Adjustment Panel */}
      <div className="card" style={{ borderColor: 'var(--accent-cyan)' }}>
        <h3 style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: '14px', color: 'var(--accent-cyan)' }}>
          [MUTATION] Append-Only Manual Score Adjustment
        </h3>
        <form onSubmit={handlePreSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', alignItems: 'flex-end' }}>
          <div>
            <label className="form-label">Target Team</label>
            <select
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              required
            >
              <option value="">-- Select Team --</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} (Current: {t.score} pts)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Delta Points (+ / -)</label>
            <input
              type="number"
              placeholder="e.g. 50 or -25"
              value={deltaPoints}
              onChange={(e) => setDeltaPoints(e.target.value === '' ? '' : Number(e.target.value))}
              required
            />
          </div>

          <div style={{ gridColumn: 'span 2' }}>
            <label className="form-label">Operational Reason (Mandatory Audit Requirement)</label>
            <input
              type="text"
              placeholder="e.g. Compensation for infrastructure latency on challenge 'Quantum Leak'"
              value={adjustmentReason}
              onChange={(e) => setAdjustmentReason(e.target.value)}
              required
            />
          </div>

          <div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
              style={{ width: '100%', height: '36px' }}
            >
              {isSubmitting ? 'Recording Mutation...' : 'Apply Score Adjustment'}
            </button>
          </div>
        </form>
      </div>

      {/* Authoritative Ledger Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-dim)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600 }}>
            AUTHORITATIVE EVENT LEDGER (Page {page} / {Math.max(1, Math.ceil(totalCount / 25))})
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              className="btn btn-secondary"
              disabled={page <= 1}
              onClick={() => fetchLedger(page - 1)}
              style={{ padding: '4px 10px', fontSize: '11px' }}
            >
              Prev
            </button>
            <button
              className="btn btn-secondary"
              disabled={page >= Math.ceil(totalCount / 25)}
              onClick={() => fetchLedger(page + 1)}
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
              <th>Team</th>
              <th>Event Classification</th>
              <th>Associated Challenge</th>
              <th>Points Delta</th>
              <th>Running Team Score</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                  Loading authoritative score ledger...
                </td>
              </tr>
            ) : ledger.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                  No scoring events found in ledger.
                </td>
              </tr>
            ) : (
              ledger.map((entry) => (
                <tr key={entry.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
                    {new Date(entry.createdAt).toLocaleString()}
                  </td>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {entry.teamName}
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        background:
                          entry.eventType === 'SOLVE'
                            ? 'rgba(34, 197, 94, 0.15)'
                            : entry.eventType === 'CHECKPOINT'
                            ? 'rgba(6, 182, 212, 0.15)'
                            : entry.eventType === 'HINT_PENALTY'
                            ? 'rgba(234, 179, 8, 0.15)'
                            : 'rgba(168, 85, 247, 0.15)',
                        color:
                          entry.eventType === 'SOLVE'
                            ? 'var(--status-green)'
                            : entry.eventType === 'CHECKPOINT'
                            ? 'var(--accent-cyan)'
                            : entry.eventType === 'HINT_PENALTY'
                            ? 'var(--status-amber)'
                            : '#c084fc',
                        border: `1px solid ${
                          entry.eventType === 'SOLVE'
                            ? 'var(--status-green)'
                            : entry.eventType === 'CHECKPOINT'
                            ? 'var(--accent-cyan)'
                            : entry.eventType === 'HINT_PENALTY'
                            ? 'var(--status-amber)'
                            : '#c084fc'
                        }`,
                      }}
                    >
                      {entry.eventType}
                    </span>
                  </td>
                  <td style={{ fontSize: '12px' }}>
                    {entry.challengeTitle || '—'}
                  </td>
                  <td
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      color: entry.points > 0 ? 'var(--status-green)' : entry.points < 0 ? 'var(--status-red)' : 'var(--text-muted)',
                    }}
                  >
                    {entry.points > 0 ? `+${entry.points}` : entry.points} pts
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--accent-cyan)' }}>
                    {entry.runningTeamScore} pts
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        isOpen={showConfirmModal}
        title="High-Impact Score Adjustment Authorization"
        message={`You are about to adjust ${selectedTeamName}'s score by ${Number(deltaPoints) > 0 ? '+' : ''}${deltaPoints} points. This directly alters competition standings.`}
        warningNote={`Mandatory audit reason recorded: "${adjustmentReason}"`}
        requiredPhrase={Number(deltaPoints) < 0 ? 'PENALTY' : 'ADJUST'}
        confirmLabel="Authorize Adjustment"
        isDestructive={Number(deltaPoints) < 0}
        onConfirm={executeScoreAdjustment}
        onCancel={() => setShowConfirmModal(false)}
      />
    </div>
  );
};
