import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authService } from './auth.service.js';
import { registerSchema, loginSchema } from './auth.schema.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { generateCsrfToken } from '../../middleware/csrf.middleware.js';
import { checkRateLimit } from '../../utils/rate_limiter.js';
import { config } from '../../config/env.js';

export const authRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // ---------------------------------------------------------------------------
  // 1. REGISTER
  // ---------------------------------------------------------------------------
  app.post('/register', { bodyLimit: 16384 }, async (req, reply) => {
    // Rate limit: 5 registrations per minute per IP
    const rateLimit = await checkRateLimit(`auth:register:${req.ip}`, 5, 60000);
    if (!rateLimit.allowed) {
      return reply.tooManyRequests('Too many registration attempts. Please wait before trying again.');
    }

    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.badRequest(parseResult.error.errors[0].message);
    }

    try {
      const result = await authService.register(parseResult.data);

      const token = app.jwt.sign({
        id: result.user.id,
        username: result.user.username,
        email: result.user.email,
        role: result.user.role,
        teamId: null,
        teamRole: null,
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

      return reply.status(201).send({
        success: true,
        user: result.user,
        team: null,
        token,
        csrfToken,
      });
    } catch (err: any) {
      if (err.message === 'USERNAME_EXISTS') {
        return reply.conflict('Username is already taken');
      }
      if (err.message === 'EMAIL_EXISTS') {
        return reply.conflict('Email is already registered');
      }
      req.log.error({ err }, 'Registration error');
      return reply.internalServerError('Failed to register user account');
    }
  });

  // ---------------------------------------------------------------------------
  // 2. LOGIN
  // ---------------------------------------------------------------------------
  app.post('/login', { bodyLimit: 16384 }, async (req, reply) => {
    // Rate limit: 10 login attempts per minute per IP
    const rateLimit = await checkRateLimit(`auth:login:${req.ip}`, 10, 60000);
    if (!rateLimit.allowed) {
      return reply.tooManyRequests('Too many login attempts. Please wait before trying again.');
    }

    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.badRequest(parseResult.error.errors[0].message);
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
};
