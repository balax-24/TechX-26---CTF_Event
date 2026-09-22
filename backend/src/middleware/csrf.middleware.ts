import { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config/env.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

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

    // Verify Origin or Referer if present
    if (origin) {
      try {
        const originUrl = new URL(origin);
        const originHost = originUrl.origin;
        const isAllowed =
          allowedOrigins.includes('*') ||
          allowedOrigins.some((allowed) => allowed === originHost || allowed === origin);

        if (!isAllowed && config.NODE_ENV === 'production') {
          return reply.forbidden('CSRF_ORIGIN_INVALID: Cross-origin request not permitted');
        }
      } catch {
        return reply.forbidden('CSRF_ORIGIN_MALFORMED: Invalid origin header');
      }
    }

    // Require anti-CSRF custom header for all cookie-authenticated mutations
    const csrfHeader =
      (req.headers['x-csrf-token'] as string) ||
      (req.headers['x-ctf-admin'] as string) ||
      (req.headers['x-requested-with'] as string);

    if (!csrfHeader) {
      return reply.forbidden(
        'CSRF_TOKEN_MISSING: Cookie-authenticated mutations require X-CSRF-Token or X-CTF-Admin custom header'
      );
    }
  }
}
