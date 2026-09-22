/**
 * Centralized Typed API Client for TechX CTF 2026.
 * Encapsulates credentials, precise CSRF token attachment & single-retry semantics,
 * standardized error handling, and JSON parsing.
 */

export class ApiError extends Error {
  statusCode: number;
  code?: string;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

// In-memory CSRF token cache
let cachedCsrfToken: string | null = null;

export function setCachedCsrfToken(token: string | null): void {
  cachedCsrfToken = token;
}

export function clearCachedCsrfToken(): void {
  cachedCsrfToken = null;
}

export function getCachedCsrfToken(): string | null {
  if (cachedCsrfToken) return cachedCsrfToken;

  // Fallback: Check document.cookie for csrf_token
  if (typeof document !== 'undefined') {
    const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    if (match) {
      cachedCsrfToken = decodeURIComponent(match[1]);
      return cachedCsrfToken;
    }
  }
  return null;
}

// Unauthorized (401) global callback listener
let onUnauthorizedHandler: (() => void) | null = null;

export function setOnUnauthorized(handler: (() => void) | null): void {
  onUnauthorizedHandler = handler;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

async function fetchCsrfToken(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/csrf`, {
      method: 'GET',
      credentials: 'include',
    });
    if (res.ok) {
      const data = await res.json();
      if (data.csrfToken) {
        setCachedCsrfToken(data.csrfToken);
        return data.csrfToken;
      }
    }
  } catch {
    // Non-blocking fallback
  }
  return null;
}

export async function request<T = any>(
  endpoint: string,
  options: RequestInit = {},
  isRetry = false
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  // Ensure CSRF token is attached for cookie-authenticated browser mutations
  if (isMutation) {
    let token = getCachedCsrfToken();
    if (!token) {
      token = await fetchCsrfToken();
    }
    if (token) {
      headers['X-CSRF-Token'] = token;
    }
  }

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });
  } catch (netErr: any) {
    // Distinguish network timeout / abort from general network disconnection
    const isTimeout =
      netErr?.name === 'AbortError' ||
      netErr?.name === 'TimeoutError' ||
      (typeof netErr?.message === 'string' && netErr.message.toLowerCase().includes('timeout'));

    if (isTimeout) {
      throw new ApiError(
        'The request timed out. Please check your connection and verify your challenge status before trying again.',
        408,
        'REQUEST_TIMEOUT'
      );
    }

    throw new ApiError(
      'Unable to connect to the TechX CTF server. Please check your network connection.',
      0,
      'NETWORK_ERROR'
    );
  }

  // Parse JSON response or empty body
  let data: any = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  // Handle 401 Unauthorized globally to clean up stale authenticated state
  if (response.status === 401) {
    if (onUnauthorizedHandler) {
      onUnauthorizedHandler();
    }
  }

  if (!response.ok) {
    const rawMessage = data?.message || data?.error || 'An unexpected error occurred';
    const rawCode = data?.code || data?.error;

    // Check if error is specifically CSRF-related
    const isCsrfFailure =
      typeof rawMessage === 'string' &&
      (rawMessage.includes('CSRF_REQUIRED') ||
        rawMessage.includes('CSRF_INVALID') ||
        rawMessage.includes('CSRF_ORIGIN_') ||
        rawCode === 'CSRF_INVALID' ||
        rawCode === 'CSRF_REQUIRED');

    // Stage 7 Hardening Rule: Only retry ONCE when the backend explicitly identifies a CSRF-related failure.
    // Business 403s (TEAM_DISQUALIFIED, COMPETITION_PAUSED, COMPETITION_ENDED, FORBIDDEN, ADMIN_PARTICIPATION_FORBIDDEN) MUST NOT RETRY!
    if (response.status === 403 && isCsrfFailure && isMutation && !isRetry) {
      clearCachedCsrfToken();
      const freshToken = await fetchCsrfToken();
      if (freshToken) {
        return request<T>(
          endpoint,
          {
            ...options,
            headers: {
              ...headers,
              'X-CSRF-Token': freshToken,
            },
          },
          true // Mark as retry
        );
      }
    }

    // Standardized user-friendly error translations for non-retried errors
    let message = rawMessage;
    if (response.status === 429) {
      message = "You're submitting too quickly. Please wait a moment before trying again.";
    } else if (rawMessage === 'COMPETITION_PAUSED' || rawCode === 'COMPETITION_PAUSED') {
      message = 'The competition is temporarily paused. Your team data and progress are safe.';
    } else if (rawMessage === 'COMPETITION_ENDED' || rawCode === 'COMPETITION_ENDED') {
      message = 'The competition has ended. Submissions are now closed.';
    } else if (rawMessage === 'TEAM_DISQUALIFIED' || rawCode === 'TEAM_DISQUALIFIED') {
      message = 'Your team has been disqualified. Access to challenges and scoring has been revoked.';
    } else if (rawMessage === 'TEAM_DISABLED' || rawCode === 'TEAM_DISABLED') {
      message = 'Your team is currently disabled by administrators.';
    } else if (rawMessage === 'CHALLENGE_LOCKED_FOR_SCORING') {
      message = 'This challenge has active solves and cannot be modified.';
    }

    throw new ApiError(message, response.status, rawCode);
  }

  return data as T;
}

export const apiClient = {
  get: <T = any>(endpoint: string, headers?: Record<string, string>) =>
    request<T>(endpoint, { method: 'GET', headers }),

  post: <T = any>(endpoint: string, body?: any, headers?: Record<string, string>) =>
    request<T>(endpoint, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      headers,
    }),

  patch: <T = any>(endpoint: string, body?: any, headers?: Record<string, string>) =>
    request<T>(endpoint, {
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      headers,
    }),

  delete: <T = any>(endpoint: string, headers?: Record<string, string>) =>
    request<T>(endpoint, { method: 'DELETE', headers }),

  clearCachedCsrfToken,
  setCachedCsrfToken,
  setOnUnauthorized,
};
