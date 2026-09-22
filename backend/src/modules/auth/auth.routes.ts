import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authService } from './auth.service.js';
import { registerSchema, loginSchema } from './auth.schema.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { config } from '../../config/env.js';

export const authRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // ---------------------------------------------------------------------------
  // 1. REGISTER
  // ---------------------------------------------------------------------------
  app.post('/register', async (req, reply) => {
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

      reply.setCookie('access_token', token, {
        path: '/',
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 86400,
      });

      return reply.status(201).send({
        success: true,
        user: result.user,
        team: null,
        token,
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
  app.post('/login', async (req, reply) => {
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

      reply.setCookie('access_token', token, {
        path: '/',
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 86400,
      });

      return reply.send({
        success: true,
        user: result.user,
        team: result.team,
        token,
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
    return reply.send({
      success: true,
      message: 'Logged out successfully',
    });
  });

  // ---------------------------------------------------------------------------
  // 4. CURRENT USER PROFILE (/me)
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
