import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authService } from './auth.service.js';
import { registerSchema, loginSchema } from './auth.schema.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { generateCsrfToken, csrfProtection } from '../../middleware/csrf.middleware.js';
import { checkRateLimit } from '../../utils/rate_limiter.js';
import { config } from '../../config/env.js';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters long'),
});

export const authRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // ---------------------------------------------------------------------------
  // 1. REGISTER (DISABLED - Participant accounts are admin-provisioned only)
  // ---------------------------------------------------------------------------
  app.post('/register', { bodyLimit: 16384 }, async (req, reply) => {
    // Rate limit: 5 attempts per minute per IP against spam/flooding
    const rateLimit = await checkRateLimit(`auth:register:${req.ip}`, 5, 60000);
    if (!rateLimit.allowed) {
      return reply.tooManyRequests('Too many registration attempts. Please wait before trying again.');
    }

    return reply.status(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Public registration is disabled. Participant accounts are provisioned by tournament administrators.',
      code: 'PUBLIC_REGISTRATION_DISABLED',
    });
  });

  // ---------------------------------------------------------------------------
  // 2. LOGIN
  // ---------------------------------------------------------------------------
  app.post('/login', { bodyLimit: 16384 }, async (req, reply) => {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.badRequest(parseResult.error.errors[0].message);
    }

    // Rate limit: 120 attempts/min in production/LAN (supports 50+ concurrent participants behind NAT), 10 in test
    const maxLoginAttempts = config.NODE_ENV === 'test' ? 10 : 120;
    const ipRateLimit = await checkRateLimit(`auth:login:${req.ip}`, maxLoginAttempts, 60000);
    if (!ipRateLimit.allowed) {
      return reply.tooManyRequests('Too many login attempts. Please wait before trying again.');
    }

    // Rate limit: 15 login attempts per minute per account identifier (defends against targeted account brute force)
    const targetAccount = parseResult.data.identifier.toLowerCase().trim();
    const accountRateLimit = await checkRateLimit(`auth:login:acc:${targetAccount}`, 15, 60000);
    if (!accountRateLimit.allowed) {
      return reply.tooManyRequests('Too many login attempts for this account. Please wait before trying again.');
    }

    try {
      const result = await authService.login(parseResult.data);
      if (!result) {
        return reply.unauthorized('Invalid username/email or password');
      }

      const token = app.jwt.sign({
        id: result.user.id,
        username: result.user.username,
        email: result.user.email,
        role: result.user.role,
        teamId: result.team?.id || null,
        teamRole: result.team?.role || null,
      });

      const csrfToken = generateCsrfToken(result.user.id);

      reply.setCookie('access_token', token, {
        path: '/',
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 86400,
      });

      reply.setCookie('csrf_token', csrfToken, {
        path: '/',
        httpOnly: false,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 86400,
      });

      return reply.send({
        success: true,
        user: result.user,
        team: result.team,
        token,
        csrfToken,
      });
    } catch (err: any) {
      req.log.error({ err }, 'Login error');
      return reply.internalServerError('Authentication failed');
    }
  });

  // ---------------------------------------------------------------------------
  // 3. LOGOUT
  // ---------------------------------------------------------------------------
  app.post('/logout', async (_req, reply) => {
    reply.clearCookie('access_token', { path: '/' });
    reply.clearCookie('csrf_token', { path: '/' });
    return reply.send({
      success: true,
      message: 'Logged out successfully',
    });
  });

  // ---------------------------------------------------------------------------
  // 4. CSRF TOKEN RETRIEVAL (/csrf)
  // ---------------------------------------------------------------------------
  app.get('/csrf', { preHandler: [authenticate] }, async (req, reply) => {
    const csrfToken = generateCsrfToken(req.user!.id);
    reply.setCookie('csrf_token', csrfToken, {
      path: '/',
      httpOnly: false,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 86400,
    });
    return reply.send({ csrfToken });
  });

  // ---------------------------------------------------------------------------
  // 5. CURRENT USER PROFILE (/me)
  // ---------------------------------------------------------------------------
  app.get('/me', { preHandler: [authenticate] }, async (req, reply) => {
    try {
      const profile = await authService.getProfile(req.user!.id);
      if (!profile) {
        return reply.notFound('User profile not found');
      }

      return reply.send({
        success: true,
        user: profile.user,
        team: profile.team,
      });
    } catch (err: any) {
      req.log.error({ err }, 'Get profile error');
      return reply.internalServerError('Failed to retrieve user profile');
    }
  });

  // ---------------------------------------------------------------------------
  // 6. CHANGE PASSWORD (/change-password)
  // ---------------------------------------------------------------------------
  app.post(
    '/change-password',
    { preHandler: [authenticate, csrfProtection], bodyLimit: 16384 },
    async (req, reply) => {
      const rateLimit = await checkRateLimit(`auth:change-password:${req.user!.id}`, 5, 60000);
      if (!rateLimit.allowed) {
        return reply.tooManyRequests('Too many password change attempts. Please slow down.');
      }

      const parseResult = changePasswordSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.badRequest(parseResult.error.errors[0].message);
      }

      try {
        await authService.changePassword({
          userId: req.user!.id,
          currentPassword: parseResult.data.currentPassword,
          newPassword: parseResult.data.newPassword,
          ip: req.ip,
        });

        // Re-issue updated JWT and CSRF tokens
        const token = app.jwt.sign({
          id: req.user!.id,
          username: req.user!.username,
          email: req.user!.email,
          role: req.user!.role,
          teamId: req.user!.teamId || null,
          teamRole: req.user!.teamRole || null,
        });

        const csrfToken = generateCsrfToken(req.user!.id);

        reply.setCookie('access_token', token, {
          path: '/',
          httpOnly: true,
          secure: config.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 86400,
        });

        reply.setCookie('csrf_token', csrfToken, {
          path: '/',
          httpOnly: false,
          secure: config.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 86400,
        });

        return reply.send({
          success: true,
          message: 'Password changed successfully',
          token,
          csrfToken,
        });
      } catch (err: any) {
        if (err.message === 'INVALID_CURRENT_PASSWORD') {
          return reply.badRequest('Current password is incorrect');
        }
        if (err.message === 'PASSWORD_TOO_SHORT') {
          return reply.badRequest('New password must be at least 8 characters');
        }
        if (err.message === 'PASSWORD_UNCHANGED') {
          return reply.badRequest('New password must be different from current password');
        }
        req.log.error({ err }, 'Change password error');
        return reply.internalServerError('Failed to change password');
      }
    }
  );
};
