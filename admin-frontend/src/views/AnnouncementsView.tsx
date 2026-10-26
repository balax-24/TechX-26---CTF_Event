import React, { useEffect, useState } from 'react';
import { Announcement } from '../types';
import { useAuth } from '../context/AuthContext';
import { ConfirmModal } from '../components/ConfirmModal';

export const AnnouncementsView: React.FC = () => {
  const { csrfToken } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // Delete State
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);

  const fetchAnnouncements = async () => {
    try {
      const res = await fetch('/api/v1/admin/announcements');
      if (res.ok) {
        const data = await res.json();
        setAnnouncements(Array.isArray(data) ? data : []);
      }
    } catch {} finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setStatusMessage('Error: Title and announcement content are required.');
      return;
    }

    setIsPublishing(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/v1/admin/announcements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken || '',
        },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          isPinned,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setStatusMessage('✓ Announcement broadcasted across participant event feed.');
        setTitle('');
        setContent('');
        setIsPinned(false);
        fetchAnnouncements();
      } else {
        setStatusMessage(`Error: ${data.message || 'Failed to post announcement'}`);
      }
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDeleteAnnouncement = async () => {
    if (!deleteTarget) return;
    const { id, title: aTitle } = deleteTarget;
    setDeleteTarget(null);

    try {
      const res = await fetch(`/api/v1/admin/announcements/${id}`, {
        method: 'DELETE',
        headers: {
          'x-csrf-token': csrfToken || '',
        },
      });

      const data = await res.json();
      if (res.ok) {
        setStatusMessage(`✓ Announcement "${aTitle}" deleted successfully.`);
        fetchAnnouncements();
      } else {
        setStatusMessage(`Error: ${data.message || 'Delete failed'}`);
      }
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', textTransform: 'uppercase' }}>
          EVENT BROADCAST ANNOUNCEMENTS
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
          Publish real-time announcements, hint releases, or operational advisories to participant feeds.
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

      {/* Broadcast Form */}
      <div className="card" style={{ borderColor: 'var(--border-dim)' }}>
        <h3 style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: '14px', color: 'var(--accent-cyan)' }}>
          [DISPATCH] Create Broadcast Announcement
        </h3>
        <form onSubmit={handleCreateAnnouncement} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <label className="form-label">Subject Header</label>
              <input
                type="text"
                placeholder="e.g. Critical Challenge Clarification: 'Quantum Leak'"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div style={{ paddingTop: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="isPinned"
                checked={isPinned}
                onChange={(e) => setIsPinned(e.target.checked)}
                style={{ width: '16px', height: '16px' }}
              />
              <label htmlFor="isPinned" style={{ fontSize: '12px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                Pin to Top of Feed
              </label>
            </div>
          </div>

          <div>
            <label className="form-label">Announcement Content (Markdown / Plain Text)</label>
            <textarea
              rows={3}
              placeholder="Enter exact message to be dispatched to participant dashboards..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isPublishing}
              style={{ minWidth: '160px' }}
            >
              {isPublishing ? 'Dispatching...' : 'Dispatch Announcement'}
            </button>
          </div>
        </form>
      </div>

      {/* Active Broadcasts List */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-dim)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600 }}>
            PUBLISHED ANNOUNCEMENTS ({announcements.length})
          </span>
          <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '11px' }} onClick={fetchAnnouncements}>
            Refresh Feed
          </button>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
            Retrieving published announcements...
          </div>
        ) : announcements.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
            No announcements published yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {announcements.map((item) => (
              <div
                key={item.id}
                style={{
                  padding: '14px 18px',
                  borderBottom: '1px solid var(--border-dim)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '16px',
                  background: item.isPinned ? 'rgba(6, 182, 212, 0.03)' : 'transparent',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    {item.isPinned && (
                      <span
                        className="badge"
                        style={{
                          background: 'rgba(6, 182, 212, 0.15)',
                          color: 'var(--accent-cyan)',
                          border: '1px solid rgba(6, 182, 212, 0.4)',
                        }}
                      >
                        PINNED
                      </span>
                    )}
                    <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {item.title}
                    </h4>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      • {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                    {item.content}
                  </p>
                </div>

                <button
                  className="btn btn-danger"
                  style={{ padding: '4px 10px', fontSize: '11px' }}
                  onClick={() => setDeleteTarget(item)}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {deleteTarget && (
        <ConfirmModal
          isOpen={true}
          title="Delete Announcement"
          message={`Are you sure you want to remove the broadcast announcement "${deleteTarget.title}"?`}
          requiredPhrase="DELETE"
          confirmLabel="Delete Announcement"
          isDestructive={true}
          onConfirm={handleDeleteAnnouncement}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
};
