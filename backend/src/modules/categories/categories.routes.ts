import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { challengesService } from '../challenges/challenges.service.js';

export const categoryRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get('/', async (_req, reply) => {
    try {
      const categories = await challengesService.listCategories();
      return reply.send({
        success: true,
        categories,
      });
    } catch (err: any) {
      app.log.error({ err }, 'Error retrieving categories');
      return reply.internalServerError('Failed to retrieve categories');
    }
  });
};
