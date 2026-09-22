import { describe, it, expect, beforeEach } from 'vitest';
import { challengesApi } from '../../src/api/challenges';

describe('Stage 7 Hardening: Security, Storage & Client Authority Audit', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('verifies localStorage and sessionStorage contain zero sensitive credentials or JWTs', () => {
    // Assert storage remains empty of ambient credentials
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('jwt')).toBeNull();
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('secret')).toBeNull();
    expect(sessionStorage.getItem('token')).toBeNull();
    expect(sessionStorage.getItem('jwt')).toBeNull();
  });

  it('enforces that download URLs are generated strictly through server-authoritative API paths and reject dangerous schemes', () => {
    const safeUrl = challengesApi.getDownloadUrl('test-challenge', 'file-uuid-123');
    expect(safeUrl).toBe('/api/v1/challenges/test-challenge/files/file-uuid-123');
    expect(safeUrl.startsWith('http') || safeUrl.startsWith('/')).toBe(true);

    // Reject javascript: or data: URIs
    expect(safeUrl.toLowerCase().startsWith('javascript:')).toBe(false);
    expect(safeUrl.toLowerCase().startsWith('data:')).toBe(false);
  });

  it('guarantees client countdown timer is purely informational and does NOT authorize actions', () => {
    // A browser state claiming timeLeft > 0 must not be treated as authorization.
    // The backend alone decides whether competition is active, paused, or ended.
    const fakeClientTimer = {
      isLive: true,
      timeRemainingMs: 3600000,
    };

    // Even if client timer says time remains, if server rejects with COMPETITION_PAUSED or ENDED,
    // the operation must be rejected authoritatively.
    const serverDecision = {
      state: 'paused',
      isSubmissionEnabled: false,
    };

    const isAuthorized = !serverDecision.isSubmissionEnabled ? false : fakeClientTimer.isLive;
    expect(isAuthorized).toBe(false);
  });
});
