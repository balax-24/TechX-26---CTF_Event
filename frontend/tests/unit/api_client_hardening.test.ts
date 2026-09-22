import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  apiClient,
  setCachedCsrfToken,
  clearCachedCsrfToken,
  getCachedCsrfToken,
  setOnUnauthorized,
  ApiError,
} from '../../src/api/client';

describe('Stage 7 Hardening: API Client & CSRF Precision Matrix', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    setCachedCsrfToken('test-cached-csrf-token');
    setOnUnauthorized(null);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('retries once when receiving 403 CSRF_INVALID on a mutation', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/auth/csrf')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ csrfToken: 'fresh-csrf-token-123' }),
        };
      }

      callCount++;
      if (callCount === 1) {
        // First mutation attempt fails with CSRF_INVALID
        return {
          ok: false,
          status: 403,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            statusCode: 403,
            error: 'Forbidden',
            message: 'CSRF_INVALID: Invalid or forged CSRF token',
          }),
        };
      }

      // Second attempt succeeds with fresh token
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, result: 'accepted' }),
      };
    });

    const result = await apiClient.post('/submissions', { flag: 'test' });
    expect(result.success).toBe(true);
    expect(callCount).toBe(2);
    expect(getCachedCsrfToken()).toBe('fresh-csrf-token-123');
  });

  it('retries once when receiving 403 CSRF_REQUIRED on a mutation', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/auth/csrf')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ csrfToken: 'newly-issued-token' }),
        };
      }

      callCount++;
      if (callCount === 1) {
        return {
          ok: false,
          status: 403,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            statusCode: 403,
            message: 'CSRF_REQUIRED: State-changing request requires X-CSRF-Token header',
          }),
        };
      }

      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true }),
      };
    });

    const result = await apiClient.post('/teams', { name: 'Alpha' });
    expect(result.success).toBe(true);
    expect(callCount).toBe(2);
  });

  it('does NOT retry when receiving 403 TEAM_DISQUALIFIED', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/auth/csrf')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ csrfToken: 'fresh-token' }),
        };
      }

      callCount++;
      return {
        ok: false,
        status: 403,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          statusCode: 403,
          error: 'Forbidden',
          message: 'TEAM_DISQUALIFIED',
          code: 'TEAM_DISQUALIFIED',
        }),
      };
    });

    await expect(apiClient.post('/submissions', { flag: 'test' })).rejects.toThrow(
      /disqualified/i
    );
    expect(callCount).toBe(1); // EXACTLY 1 CALL, ZERO RETRIES
  });

  it('does NOT retry when receiving 403 COMPETITION_PAUSED', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/auth/csrf')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ csrfToken: 'fresh-token' }),
        };
      }

      callCount++;
      return {
        ok: false,
        status: 403,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          statusCode: 403,
          error: 'Forbidden',
          message: 'COMPETITION_PAUSED',
        }),
      };
    });

    await expect(apiClient.post('/submissions', { flag: 'test' })).rejects.toThrow(
      /temporarily paused/i
    );
    expect(callCount).toBe(1); // ZERO RETRIES
  });

  it('does NOT retry when receiving 403 COMPETITION_ENDED', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/auth/csrf')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ csrfToken: 'fresh-token' }),
        };
      }

      callCount++;
      return {
        ok: false,
        status: 403,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          statusCode: 403,
          error: 'Forbidden',
          message: 'COMPETITION_ENDED',
        }),
      };
    });

    await expect(apiClient.post('/submissions', { flag: 'test' })).rejects.toThrow(
      /competition has ended/i
    );
    expect(callCount).toBe(1);
  });

  it('does NOT retry when receiving generic 403 FORBIDDEN', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/auth/csrf')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ csrfToken: 'fresh-token' }),
        };
      }

      callCount++;
      return {
        ok: false,
        status: 403,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Access denied',
        }),
      };
    });

    await expect(apiClient.post('/submissions', { flag: 'test' })).rejects.toThrow(
      /access denied/i
    );
    expect(callCount).toBe(1);
  });

  it('does NOT retry when receiving 400 INVALID_FLAG', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/auth/csrf')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ csrfToken: 'fresh-token' }),
        };
      }

      callCount++;
      return {
        ok: false,
        status: 400,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          statusCode: 400,
          error: 'Bad Request',
          message: 'INVALID_FLAG',
        }),
      };
    });

    await expect(apiClient.post('/submissions', { flag: 'bad_flag' })).rejects.toThrow();
    expect(callCount).toBe(1);
  });

  it('does NOT retry when receiving 429 RATE_LIMITED', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/auth/csrf')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ csrfToken: 'fresh-token' }),
        };
      }

      callCount++;
      return {
        ok: false,
        status: 429,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          statusCode: 429,
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
        }),
      };
    });

    await expect(apiClient.post('/submissions', { flag: 'test' })).rejects.toThrow(
      /submitting too quickly/i
    );
    expect(callCount).toBe(1);
  });

  it('does NOT automatically retry mutations on network timeout and returns safe uncertainty advisory', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/auth/csrf')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ csrfToken: 'fresh-token' }),
        };
      }

      callCount++;
      const timeoutError = new Error('The operation timed out');
      timeoutError.name = 'TimeoutError';
      throw timeoutError;
    });

    await expect(apiClient.post('/submissions', { flag: 'timeout_flag' })).rejects.toSatisfy(
      (err: ApiError) => {
        expect(err.statusCode).toBe(408);
        expect(err.code).toBe('REQUEST_TIMEOUT');
        expect(err.message).toContain('The request timed out');
        expect(err.message).toContain('verify your challenge status');
        return true;
      }
    );
    expect(callCount).toBe(1); // ZERO RETRIES ON MUTATION TIMEOUT
  });

  it('does NOT automatically retry mutations on generic 500 server errors', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/auth/csrf')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ csrfToken: 'fresh-token' }),
        };
      }

      callCount++;
      return {
        ok: false,
        status: 500,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'Database failure',
        }),
      };
    });

    await expect(apiClient.post('/submissions', { flag: 'test' })).rejects.toThrow(/database failure/i);
    expect(callCount).toBe(1);
  });

  it('invokes setOnUnauthorized handler when receiving 401', async () => {
    const onUnauthorizedMock = vi.fn();
    setOnUnauthorized(onUnauthorizedMock);

    global.fetch = vi.fn().mockImplementation(async () => ({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Session expired',
      }),
    }));

    await expect(apiClient.get('/auth/me')).rejects.toThrow();
    expect(onUnauthorizedMock).toHaveBeenCalledTimes(1);
  });

  it('allows manual purging of cached CSRF token via clearCachedCsrfToken()', () => {
    setCachedCsrfToken('cached-test-token');
    expect(getCachedCsrfToken()).toBe('cached-test-token');

    clearCachedCsrfToken();
    expect(getCachedCsrfToken()).toBeNull();
  });
});
