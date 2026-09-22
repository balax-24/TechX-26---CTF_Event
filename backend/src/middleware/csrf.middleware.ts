import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config/env.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Generates a cryptographically secure, session-bound CSRF token:
 * Format: <16-byte-hex-nonce>.<hmac-sha256(nonce:userId, secret)>
 */
export function generateCsrfToken(userId: string): string {
  const nonce = randomBytes(16).toString('hex');
  const signature = createHmac('sha256', config.COOKIE_SECRET)
    .update(`${nonce}:${userId}`)
    .digest('hex');
  return `${nonce}.${signature}`;
}

/**
 * Validates a CSRF token against the authenticated user ID using constant-time comparison.
 */
export function verifyCsrfToken(token: string, userId: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const dotIndex = token.indexOf('.');
  if (dotIndex <= 0) return false;

  const nonce = token.substring(0, dotIndex);
  const signature = token.substring(dotIndex + 1);
  if (!nonce || !signature) return false;

  const expected = createHmac('sha256', config.COOKIE_SECRET)
    .update(`${nonce}:${userId}`)
    .digest('hex');

  if (signature.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
}

/**
 * CSRF Protection Hook:
 * Defends state-changing requests (POST, PUT, PATCH, DELETE) against Cross-Site Request Forgery
 * when authenticated via HttpOnly session cookies.
 *
 * Programmatic Bearer token clients bypass this check as browsers never attach
 * Authorization headers to cross-site ambient requests.
 */
export async function csrfProtection(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  // 1. Safe methods bypass CSRF check
  if (SAFE_METHODS.has(req.method)) {
    return;
  }

  // 2. Programmatic clients using Authorization: Bearer header bypass CSRF check
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return;
  }

  // 3. For Cookie-authenticated browser sessions, enforce CSRF defense
  if (req.cookies && req.cookies.access_token) {
    const origin = req.headers.origin || req.headers.referer;
    const allowedOrigins = config.CORS_ORIGIN.split(',').map((o) => o.trim());

    // A. Origin verification
    if (origin) {
      try {
        const originUrl = new URL(origin);
        const originHost = originUrl.origin;
        const isAllowed =
          allowedOrigins.includes('*') ||
          allowedOrigins.some((allowed) => allowed === originHost || allowed === origin);

        if (!isAllowed) {
          return reply.forbidden('CSRF_ORIGIN_INVALID: Cross-origin request not permitted');
        }
      } catch {
        return reply.forbidden('CSRF_ORIGIN_MALFORMED: Invalid origin header');
      }
    } else if (config.NODE_ENV === 'production') {
      // In production browser environments, cookie mutations require Origin or Referer
      return reply.forbidden('CSRF_ORIGIN_REQUIRED: Origin or Referer header required for browser mutations');
    }

    // B. CSRF token presence check
    const csrfToken = req.headers['x-csrf-token'] as string;
    if (!csrfToken) {
      return reply.forbidden('CSRF_REQUIRED: State-changing request requires X-CSRF-Token header');
    }

    // C. Cryptographic token validity bound to authenticated user
    const userId = (req.user as any)?.id;
    if (!userId) {
      return reply.unauthorized('AUTH_REQUIRED: User session required for CSRF validation');
    }

    const isValid = verifyCsrfToken(csrfToken, userId);
    if (!isValid) {
      return reply.forbidden('CSRF_INVALID: Invalid or forged CSRF token');
    }

    // D. Double-submit cookie verification if csrf_token cookie is attached
    if (req.cookies.csrf_token && req.cookies.csrf_token !== csrfToken) {
      return reply.forbidden('CSRF_DOUBLE_SUBMIT_MISMATCH: Header token does not match cookie');
    }
  }
}
