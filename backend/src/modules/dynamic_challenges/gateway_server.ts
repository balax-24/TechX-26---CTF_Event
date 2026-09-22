import * as os from 'os';
import { ChallengeGatewayService, createGatewayHttpServer } from './challenge_gateway.service.js';
import { NativeDockerManager } from './docker.manager.js';
import { logger } from '../../utils/logger.js';

/**
 * Discovers the IP of the trusted internal interface (ctf_gateway_net).
 * In Docker, eth0 is assigned to the service's primary network (ctf_gateway_net) at container boot.
 * When dynamic challenge networks are subsequently connected, Docker creates eth1, eth2, etc.
 * By binding ONLY to eth0 (or GATEWAY_HOST), the gateway never listens on challenge interfaces.
 */
export function getTrustedBindHost(): string {
  // If explicitly configured and not 0.0.0.0, respect it
  if (process.env.GATEWAY_HOST && process.env.GATEWAY_HOST !== '0.0.0.0') {
    return process.env.GATEWAY_HOST;
  }

  const interfaces = os.networkInterfaces();

  // In Docker container, eth0 is the primary interface on ctf_gateway_net at boot time
  if (interfaces['eth0']) {
    const eth0Ipv4 = interfaces['eth0'].find((addr) => addr.family === 'IPv4' && !addr.internal);
    if (eth0Ipv4) {
      return eth0Ipv4.address;
    }
  }

  // Fallback to first non-internal, non-loopback IPv4 interface
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!name.startsWith('lo') && addrs) {
      const match = addrs.find((addr) => addr.family === 'IPv4' && !addr.internal);
      if (match) {
        return match.address;
      }
    }
  }

  // Default for tests / development
  return '127.0.0.1';
}

const port = parseInt(process.env.GATEWAY_PORT || '5000', 10);
const secret = process.env.CHALLENGE_GATEWAY_SECRET || 'techx_gateway_secure_internal_token_2026';
const bindHost = getTrustedBindHost();

// The Challenge Gateway service manages the Docker daemon socket exclusively.
// The Core Backend has NO Docker socket and NO attachment to challenge networks.
const dockerManager = new NativeDockerManager();
const service = new ChallengeGatewayService(dockerManager);
service.trustedBindIp = bindHost;

const server = createGatewayHttpServer(service, secret);

server.listen(port, bindHost, () => {
  logger.info({ port, bindHost }, 'TechX CTF Challenge Gateway Service listening strictly on trusted interface: ' + bindHost);
});

// Also bind loopback interface if bindHost is not loopback, to support local healthcheck probes inside the container
if (bindHost !== '127.0.0.1' && bindHost !== 'localhost') {
  const loopbackServer = createGatewayHttpServer(service, secret);
  loopbackServer.listen(port, '127.0.0.1', () => {
    logger.info({ port }, 'TechX CTF Challenge Gateway Service listening on loopback for local health checks');
  });
}
