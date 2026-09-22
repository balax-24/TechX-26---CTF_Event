import { ChallengeGatewayService, createGatewayHttpServer } from './challenge_gateway.service.js';
import { NativeDockerManager } from './docker.manager.js';
import { logger } from '../../utils/logger.js';

const port = parseInt(process.env.GATEWAY_PORT || '5000', 10);
const secret = process.env.CHALLENGE_GATEWAY_SECRET || 'techx_gateway_secure_internal_token_2026';

// The Challenge Gateway service manages the Docker daemon socket exclusively.
// The Core Backend has NO Docker socket and NO attachment to challenge networks.
const dockerManager = new NativeDockerManager();
const service = new ChallengeGatewayService(dockerManager);
const server = createGatewayHttpServer(service, secret);

server.listen(port, '0.0.0.0', () => {
  logger.info({ port }, 'TechX CTF Challenge Gateway Service listening on port ' + port);
});
