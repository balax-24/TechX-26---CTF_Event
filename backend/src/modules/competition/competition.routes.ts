import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { competitionService } from './competition.service.js';

export const competitionRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  /**
   * GET /api/v1/competition/state
   * Public, unauthenticated endpoint allowing participants and visitors to
   * query the current authoritative contest lifecycle state, schedule, and countdowns.
   */
  app.get('/state', async (_req, reply) => {
    try {
      const state = await competitionService.getCompetitionState();
      return reply.send({
        success: true,
        competition: {
          name: state.name,
          state: state.state,
          startTime: state.startTime ? state.startTime.toISOString() : null,
          endTime: state.endTime ? state.endTime.toISOString() : null,
          registrationStartTime: state.registrationStartTime ? state.registrationStartTime.toISOString() : null,
          registrationEndTime: state.registrationEndTime ? state.registrationEndTime.toISOString() : null,
          timezone: state.timezone,
          isSubmissionEnabled: state.isSubmissionEnabled,
        },
      });
    } catch (err: any) {
      app.log.error({ err }, 'Error retrieving public competition state');
      return reply.internalServerError('Failed to retrieve competition state');
    }
  });
};
