import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthUser, UserRole } from '../types/auth.js';

/**
 * Authentication Middleware Hook:
 * Extracts and validates JWT session token.
 *
 * PREFERRED PRODUCTION PATHS:
 * 1. Authorization: Bearer <token> (programmatic REST API clients)
 * 2. HttpOnly Cookie: access_token (preferred production mechanism for same-origin browser SSE and Web UI)
 *
 * NON-PREFERRED COMPATIBILITY FALLBACK:
 * 3. Query Param: ?token=<token> (strictly non-preferred; retained exclusively for dev/LAN tooling compatibility.
 *    Redacted by structured logger before writing to logs or traces).
 */
export async function authenticate(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  let token: string | undefined;

  // 1. Authorization: Bearer header (preferred for programmatic API clients)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  // 2. HTTP-only cookie (preferred production mechanism for same-origin browser SSE & Web UI)
  if (!token && req.cookies && req.cookies.access_token) {
    token = req.cookies.access_token;
  }

  // 3. Non-preferred dev/LAN fallback (query parameter)
  // Strictly non-preferred in production; sanitized in structured logging.
  if (!token && (req.query as any)?.token) {
    token = (req.query as any).token;
  }

  if (!token) {
    return reply.unauthorized('Authentication token missing or invalid');
  }

  try {
    const decoded = req.server.jwt.verify<AuthUser>(token);
    req.user = decoded;
  } catch (err: any) {
    return reply.unauthorized('Invalid or expired authentication token');
  }
}

/**
 * Role-Based Access Control Hook:
 * Enforces that caller has one of the required roles.
 */
export function requireRole(allowedRoles: UserRole[]) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!req.user) {
      return reply.unauthorized('Authentication required');
    }

    if (!allowedRoles.includes(req.user.role)) {
      return reply.forbidden('Insufficient permissions to access this resource');
    }
  };
}

/**
 * Team Membership Guard Hook:
 * Verifies that the authenticated user belongs to an active team.
 */
export async function requireTeam(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.user) {
    return reply.unauthorized('Authentication required');
  }

  if (!req.user.teamId) {
    return reply.badRequest('You must be a member of a team to perform this action');
  }
}

/**
 * Team Captain Guard Hook:
 * Verifies that the caller is the captain of their team or an administrative user.
 */
export async function requireCaptain(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.user) {
    return reply.unauthorized('Authentication required');
  }

  if (req.user.role === 'admin' || req.user.role === 'superadmin') {
    return; // Admins bypass captain check
  }

  if (!req.user.teamId) {
    return reply.badRequest('You must belong to a team');
  }

  if (req.user.teamRole !== 'captain') {
    return reply.forbidden('Only the team captain can execute this operation');
  }
}
