/**
 * Centralized Typed API Client for TechX CTF 2026.
 * Encapsulates credentials, CSRF token attachment, standardized error handling, and JSON parsing.
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
  options: RequestInit = {}
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

  if (!response.ok) {
    let message = data?.message || data?.error || 'An unexpected error occurred';
    const code = data?.code || data?.error;

    // Standardized user-friendly error translations
    if (response.status === 429) {
      message = "You're submitting too quickly. Please wait a moment before trying again.";
    } else if (message === 'COMPETITION_PAUSED' || code === 'COMPETITION_PAUSED') {
      message = 'The competition is temporarily paused. Your team data and progress are safe.';
    } else if (message === 'COMPETITION_ENDED' || code === 'COMPETITION_ENDED') {
      message = 'The competition has ended. Submissions are now closed.';
    } else if (message === 'TEAM_DISQUALIFIED' || code === 'TEAM_DISQUALIFIED') {
      message = 'Your team has been disqualified. Access to challenges and scoring has been revoked.';
    } else if (message === 'TEAM_DISABLED' || code === 'TEAM_DISABLED') {
      message = 'Your team is currently disabled by administrators.';
    } else if (message === 'CHALLENGE_LOCKED_FOR_SCORING') {
      message = 'This challenge has active solves and cannot be modified.';
    }

    throw new ApiError(message, response.status, code);
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
};
