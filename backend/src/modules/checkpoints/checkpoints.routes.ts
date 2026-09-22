import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { checkpointsService } from './checkpoints.service.js';
import {
  validateCheckpointParamsSchema,
  validateCheckpointBodySchema,
} from './checkpoints.schema.js';
import { authenticate, requireTeam } from '../../middleware/auth.middleware.js';
import { checkRateLimit } from '../../utils/rate_limiter.js';

export const checkpointRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post(
    '/:checkpointId/validate',
    { preHandler: [authenticate, requireTeam] },
    async (req, reply) => {
      const teamId = req.user!.teamId!;

      // 1. Validate params and body
      const paramsResult = validateCheckpointParamsSchema.safeParse(req.params);
      if (!paramsResult.success) {
        return reply.badRequest(paramsResult.error.errors[0].message);
      }

      const bodyResult = validateCheckpointBodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        return reply.badRequest(bodyResult.error.errors[0].message);
      }

      // 2. Rate limiting: 10 attempts per minute per team
      const rateLimitResult = await checkRateLimit(`checkpoint:${teamId}`, 10, 60000);
      if (!rateLimitResult.allowed) {
        return reply.tooManyRequests('Too many checkpoint attempts. Please slow down.');
      }

      const isAdmin = req.user?.role === 'admin' || req.user?.role === 'superadmin';

      try {
        const result = await checkpointsService.validateCheckpoint({
          userId: req.user!.id,
          teamId,
          checkpointId: paramsResult.data.checkpointId,
          proof: bodyResult.data.proof,
          isAdmin,
        });

        return reply.send(result);
      } catch (err: any) {
        if (err.message === 'COMPETITION_NOT_ACTIVE') {
          return reply.forbidden('Competition is currently paused or has ended');
        }
        if (err.message === 'CHECKPOINT_NOT_FOUND') {
          return reply.notFound('Checkpoint not found');
        }
        if (err.message === 'CHALLENGE_NOT_RELEASED') {
          return reply.notFound('Challenge not yet released');
        }
        if (err.message === 'PREREQUISITE_NOT_MET') {
          return reply.badRequest('You must complete preceding checkpoints before attempting this one');
        }

        req.log.error({ err }, 'Checkpoint validation error');
        return reply.internalServerError('Failed to validate checkpoint');
      }
    }
  );
};
