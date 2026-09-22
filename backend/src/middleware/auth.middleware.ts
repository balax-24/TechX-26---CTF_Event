import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthUser, UserRole } from '../types/auth.js';

/**
 * Authentication Middleware Hook:
 * Extracts and validates JWT session token from Bearer header or HTTP-only cookie.
 */
export async function authenticate(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  let token: string | undefined;

  // 1. Check Authorization: Bearer header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  // 2. Check HTTP-only signed cookie fallback
  if (!token && req.cookies && req.cookies.access_token) {
    token = req.cookies.access_token;
  }

  // 3. Check query param fallback (for browser EventSource connections)
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
