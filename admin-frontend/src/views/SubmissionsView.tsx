import React, { useEffect, useState } from 'react';
import { Submission } from '../types';
import { useAuth } from '../context/AuthContext';
import { ConfirmModal } from '../components/ConfirmModal';

export const SubmissionsView: React.FC = () => {
  const { user, csrfToken } = useAuth();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterCorrect, setFilterCorrect] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);

  // Privileged Flag Inspection Modal (Superadmin only + audited)
  const [flagModal, setFlagModal] = useState<{
    isOpen: boolean;
    submissionId: string | null;
    flag: string | null;
    reason: string;
    isSuperadmin: boolean;
  }>({
    isOpen: false,
    submissionId: null,
    flag: null,
    reason: '',
    isSuperadmin: user?.role === 'superadmin',
  });

  const fetchSubmissions = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: '30',
      });
      if (search.trim()) params.append('search', search.trim());
      if (filterCorrect === 'true') params.append('isCorrect', 'true');
      if (filterCorrect === 'false') params.append('isCorrect', 'false');

      const res = await fetch(`/api/v1/admin/submissions?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setSubmissions(json.submissions || []);
        setTotal(json.total || 0);
      }
    } catch {} finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSubmissions();
  }, [page, filterCorrect]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchSubmissions();
  };

  const handleInspectFlag = async (submissionId: string) => {
    if (user?.role !== 'superadmin') {
      alert('Flag inspection is restricted to Superadmin role only and is strictly audited.');
      return;
    }
    const reason = prompt('Please enter the audit justification reason for inspecting this submitted flag:');
    if (!reason || !reason.trim()) return;

    try {
      const res = await fetch(`/api/v1/admin/submissions/${submissionId}/inspect-flag`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken || '',
        },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || 'Inspection rejected');
      } else {
        setFlagModal({
          isOpen: true,
          submissionId,
          flag: data.submittedFlag,
          reason,
          isSuperadmin: true,
        });
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', textTransform: 'uppercase' }}>
            SUBMISSION AUDIT & MONITORING STREAM
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
            Authoritative stream of evaluation events. Flag values are redacted from general feeds by design.
          </p>
        </div>
        <button onClick={() => fetchSubmissions()} className="btn btn-secondary">
          REFRESH
        </button>
      </div>

      {/* Filter and Search Bar */}
      <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search team, user, or challenge..."
          style={{ maxWidth: '300px', fontFamily: 'var(--font-mono)' }}
        />
        <select
          value={filterCorrect}
          onChange={(e) => {
            setFilterCorrect(e.target.value);
            setPage(1);
          }}
          style={{ maxWidth: '160px', fontFamily: 'var(--font-mono)' }}
        >
          <option value="all">All Results</option>
          <option value="true">Correct Solves Only</option>
          <option value="false">Failed Attempts Only</option>
        </select>
        <button type="submit" className="btn btn-secondary">
          FILTER
        </button>
        <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
          TOTAL SUBMISSIONS: {total}
        </div>
      </form>

      {/* Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>TIMESTAMP</th>
              <th>TEAM</th>
              <th>USER</th>
              <th>CHALLENGE</th>
              <th>RESULT</th>
              <th>SOURCE IP</th>
              <th>FLAG INSPECTION</th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((s) => (
              <tr key={s.id}>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
                  {new Date(s.createdAt).toLocaleTimeString()} ({new Date(s.createdAt).toLocaleDateString()})
                </td>
                <td style={{ fontWeight: 600 }}>{s.teamName}</td>
                <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{s.username}</td>
                <td>{s.challengeTitle}</td>
                <td>
                  <span className={`badge ${s.isCorrect ? 'badge-green' : 'badge-red'}`}>
                    {s.isCorrect ? 'CORRECT' : 'INCORRECT'}
                  </span>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
                  {s.ipAddress}
                </td>
                <td>
                  {user?.role === 'superadmin' ? (
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '2px 6px', fontSize: '10px' }}
                      onClick={() => handleInspectFlag(s.id)}
                    >
                      AUDITED INSPECT
                    </button>
                  ) : (
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      REDACTED
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {submissions.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                  No submissions found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          Showing page {page} of {Math.ceil(total / 30) || 1}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn btn-secondary"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <button
            className="btn btn-secondary"
            disabled={page >= Math.ceil(total / 30)}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>

      {/* Flag Inspection Modal */}
      {flagModal.isOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span className="badge badge-amber">PRIVILEGED AUDIT RECORDED</span>
              <button
                className="btn btn-secondary"
                style={{ padding: '2px 6px', fontSize: '10px' }}
                onClick={() => setFlagModal({ ...flagModal, isOpen: false, flag: null })}
              >
                Close
              </button>
            </div>
            <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', marginBottom: '8px' }}>
              SUBMISSION RAW VALUE
            </h3>
            <div
              style={{
                background: '#060a0f',
                border: '1px solid var(--border-bright)',
                padding: '12px',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                wordBreak: 'break-all',
                color: 'var(--accent-cyan)',
                borderRadius: '3px',
                marginBottom: '12px',
              }}
            >
              {flagModal.flag}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              JUSTIFICATION: {flagModal.reason}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
