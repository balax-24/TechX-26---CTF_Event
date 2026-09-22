import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { teamsApi } from '../api/teams';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { useToast } from '../contexts/ToastContext';
import { LoadingSkeleton, ErrorState } from '../components/feedback/FeedbackStates';

export const TeamPage: React.FC = () => {
  const { user, team, setTeam, refreshProfile } = useAuth();
  const { showToast } = useToast();

  const [teamDetails, setTeamDetails] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Forms for unassigned participants
  const [createName, setCreateName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [isActionPending, setIsActionPending] = useState(false);

  const loadTeam = useCallback(async () => {
    if (!team) {
      setTeamDetails(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await teamsApi.getMyTeam();
      if (res.success && res.team) {
        setTeamDetails(res.team);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load team details.');
    } finally {
      setIsLoading(false);
    }
  }, [team]);

  useEffect(() => {
    loadTeam();
  }, [loadTeam]);

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) return;

    setIsActionPending(true);
    try {
      const res = await teamsApi.createTeam(createName.trim());
      if (res.success && res.team) {
        setTeam(res.team);
        showToast(`Team "${res.team.name}" created!`, 'success');
        await refreshProfile();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to create team', 'error');
    } finally {
      setIsActionPending(false);
    }
  };

  const handleJoinTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;

    setIsActionPending(true);
    try {
      const res = await teamsApi.joinTeam(joinCode.trim());
      if (res.success && res.team) {
        setTeam(res.team);
        showToast(`Joined team "${res.team.name}"!`, 'success');
        await refreshProfile();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to join team', 'error');
    } finally {
      setIsActionPending(false);
    }
  };

  const handleLeaveTeam = async () => {
    if (!window.confirm('Are you sure you want to leave this team?')) return;

    setIsActionPending(true);
    try {
      const res = await teamsApi.leaveTeam();
      if (res.success) {
        setTeam(null);
        showToast(res.message || 'Left team successfully', 'info');
        await refreshProfile();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to leave team', 'error');
    } finally {
      setIsActionPending(false);
    }
  };

  const handleCopyInvite = (code: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code);
      showToast('Invite code copied to clipboard!', 'info');
    }
  };

  if (isLoading) {
    return (
      <div className="container" style={{ padding: '32px 16px' }}>
        <LoadingSkeleton rows={4} height="70px" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container" style={{ padding: '32px 16px' }}>
        <ErrorState title="Error Loading Team" message={error} onRetry={loadTeam} />
      </div>
    );
  }

  // View for participants without a team
  if (!team) {
    return (
      <div className="container" style={{ padding: '40px 16px', maxWidth: '800px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontSize: 'var(--text-2xl, 1.5rem)', marginBottom: '8px' }}>
            Team Management
          </h1>
          <p style={{ fontSize: 'var(--text-sm, 0.875rem)' }}>
            Join an existing squad using an invite code or create a new team as captain.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '24px',
          }}
        >
          {/* Create Team Form */}
          <Card variant="elevated">
            <h3 style={{ marginBottom: '16px' }}>Create New Team</h3>
            <form onSubmit={handleCreateTeam} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <Input
                label="Team Name"
                placeholder="e.g. CyberVanguard"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                disabled={isActionPending}
                required
              />
              <Button
                type="submit"
                variant="primary"
                isLoading={isActionPending}
                disabled={!createName.trim()}
              >
                Create Team
              </Button>
            </form>
          </Card>

          {/* Join Team Form */}
          <Card variant="elevated">
            <h3 style={{ marginBottom: '16px' }}>Join Existing Team</h3>
            <form onSubmit={handleJoinTeam} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <Input
                label="Team Invite Code"
                placeholder="TECHX-XXXX-YYYY"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                disabled={isActionPending}
                className="font-mono"
                required
              />
              <Button
                type="submit"
                variant="secondary"
                isLoading={isActionPending}
                disabled={!joinCode.trim()}
              >
                Join Team
              </Button>
            </form>
          </Card>
        </div>
      </div>
    );
  }

  const currentDetails = teamDetails || team;
  const isCaptain = user?.teamRole === 'captain';

  return (
    <div className="container" style={{ padding: '32px 16px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Team Header */}
      <Card variant="elevated">
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            borderBottom: '1px solid var(--color-border, #262B3F)',
            paddingBottom: '16px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <h1 style={{ fontSize: 'var(--text-2xl, 1.5rem)' }}>{currentDetails.name}</h1>
              <Badge
                variant={
                  currentDetails.status === 'ACTIVE'
                    ? 'success'
                    : currentDetails.status === 'DISQUALIFIED'
                    ? 'danger'
                    : 'warning'
                }
              >
                {currentDetails.status}
              </Badge>
            </div>
            <p style={{ fontSize: 'var(--text-sm, 0.875rem)' }}>
              Created on {new Date(currentDetails.createdAt).toLocaleDateString()}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 'var(--text-xs, 0.75rem)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                Score
              </span>
              <div
                className="font-mono"
                style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-brand-bright, #BA68C8)' }}
              >
                {currentDetails.score} PTS
              </div>
            </div>

            <Button
              variant="danger"
              size="sm"
              isLoading={isActionPending}
              onClick={handleLeaveTeam}
            >
              Leave Team
            </Button>
          </div>
        </div>

        {/* Invite Code Bar for Captain */}
        {isCaptain && currentDetails.inviteCode && (
          <div
            style={{
              marginTop: '16px',
              padding: '12px 16px',
              backgroundColor: 'var(--color-surface-sunken, #090B10)',
              borderRadius: 'var(--radius-md, 8px)',
              border: '1px dashed var(--color-border, #262B3F)',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div>
              <span style={{ fontSize: 'var(--text-xs, 0.75rem)', color: 'var(--color-text-muted)' }}>
                Team Invite Code (Share with teammates):
              </span>
              <div className="font-mono" style={{ fontWeight: 700, fontSize: '1rem', color: '#BA68C8' }}>
                {currentDetails.inviteCode}
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopyInvite(currentDetails.inviteCode)}
            >
              📋 Copy Code
            </Button>
          </div>
        )}
      </Card>

      {/* Team Roster & Solves Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '24px',
        }}
      >
        {/* Members Roster */}
        <Card>
          <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>👥</span> Roster Members ({currentDetails.members?.length || 1} / 4)
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {currentDetails.members?.map((m: any) => (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  backgroundColor: 'var(--color-surface-sunken, #090B10)',
                  border: '1px solid var(--color-border, #262B3F)',
                  borderRadius: 'var(--radius-md, 8px)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 600 }}>{m.username}</span>
                  {m.id === user?.id && <Badge variant="brand" size="sm">YOU</Badge>}
                </div>
                <Badge variant={m.role === 'captain' ? 'warning' : 'neutral'} size="sm">
                  {m.role}
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        {/* Solved Challenges */}
        <Card>
          <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🚩</span> Solved Challenges ({currentDetails.solves?.length || 0})
          </h3>
          {(!currentDetails.solves || currentDetails.solves.length === 0) ? (
            <p style={{ fontSize: 'var(--text-sm, 0.875rem)', color: 'var(--color-text-muted)' }}>
              Your team has not solved any challenges yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {currentDetails.solves.map((s: any, idx: number) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    backgroundColor: 'var(--color-surface-sunken, #090B10)',
                    border: '1px solid var(--color-border, #262B3F)',
                    borderRadius: 'var(--radius-sm, 6px)',
                    fontSize: 'var(--text-xs, 0.75rem)',
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                      {s.challengeTitle || `Challenge #${s.challengeId}`}
                    </span>
                    <span style={{ marginLeft: '8px', color: 'var(--color-text-muted)' }}>
                      ({s.category || 'General'})
                    </span>
                  </div>
                  <span
                    className="font-mono"
                    style={{ fontWeight: 700, color: 'var(--color-success, #10B981)' }}
                  >
                    +{s.points} pts
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
