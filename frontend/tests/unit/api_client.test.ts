import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient, setCachedCsrfToken, getCachedCsrfToken } from '../../src/api/client';

describe('Centralized API Client & CSRF Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setCachedCsrfToken(null);
  });

  it('manages in-memory CSRF token caching', () => {
    expect(getCachedCsrfToken()).toBeNull();
    setCachedCsrfToken('csrf-token-12345');
    expect(getCachedCsrfToken()).toBe('csrf-token-12345');
  });

  it('automatically injects X-CSRF-Token into mutation requests', async () => {
    setCachedCsrfToken('secure-csrf-hmac-token');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true }),
    });
    global.fetch = fetchMock;

    await apiClient.post('/submissions/flag', { flag: 'test' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/submissions/flag');
    expect(options.method).toBe('POST');
    expect(options.credentials).toBe('include');
    expect(options.headers['X-CSRF-Token']).toBe('secure-csrf-hmac-token');
  });

  it('translates 429 status into user-friendly rate limit message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ error: 'Too Many Requests' }),
    });

    await expect(apiClient.post('/submissions/flag', {})).rejects.toThrow(
      "You're submitting too quickly. Please wait a moment before trying again."
    );
  });

  it('translates COMPETITION_PAUSED into participant-friendly explanation', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ error: 'COMPETITION_PAUSED', message: 'COMPETITION_PAUSED' }),
    });

    await expect(apiClient.post('/submissions/flag', {})).rejects.toThrow(
      'The competition is temporarily paused. Your team data and progress are safe.'
    );
  });
});
