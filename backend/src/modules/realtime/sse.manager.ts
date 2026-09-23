import { FastifyReply } from 'fastify';
import { logger } from '../../utils/logger.js';
import { SSE_HEARTBEAT_INTERVAL_MS } from './realtime.constants.js';

export interface SSEClient {
  id: string;
  userId: string;
  teamId?: string | null;
  reply: FastifyReply;
  connectedAt: Date;
  lastPingAt: number;
}

export interface SSEManagerMetrics {
  activeConnections: number;
  connectionsOpened: number;
  connectionsClosed: number;
  eventsBroadcast: number;
  broadcastFailures: number;
}

export class SSEConnectionManager {
  private clients = new Map<string, SSEClient>();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private metrics: SSEManagerMetrics = {
    activeConnections: 0,
    connectionsOpened: 0,
    connectionsClosed: 0,
    eventsBroadcast: 0,
    broadcastFailures: 0,
  };

  /**
   * Starts periodic SSE keepalive heartbeats.
   */
  startHeartbeat(intervalMs = SSE_HEARTBEAT_INTERVAL_MS): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, intervalMs);
    // Unref so timer does not prevent process exit in test runners
    if (this.heartbeatTimer.unref) {
      this.heartbeatTimer.unref();
    }
  }

  /**
   * Stops the heartbeat timer.
   */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Registers a newly opened SSE connection.
   */
  addClient(client: SSEClient): void {
    this.clients.set(client.id, client);
    this.metrics.activeConnections = this.clients.size;
    this.metrics.connectionsOpened++;

    logger.debug(
      {
        clientId: client.id,
        userId: client.userId,
        teamId: client.teamId,
        active: this.clients.size,
      },
      'SSE client connected'
    );
  }

  /**
   * Removes and cleans up an SSE client.
   */
  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      this.clients.delete(clientId);
      this.metrics.activeConnections = this.clients.size;
      this.metrics.connectionsClosed++;

      logger.debug(
        { clientId, active: this.clients.size },
        'SSE client disconnected'
      );
    }
  }

  /**
   * Broadcasts a domain event to all currently connected clients.
   * Tolerates individual write failures by pruning dead sockets immediately.
   */
  broadcast(event: string, data: any, id?: string): void {
    const payloadStr = typeof data === 'string' ? data : JSON.stringify(data);
    let message = '';
    if (id) {
      message += `id: ${id}\n`;
    }
    message += `event: ${event}\n`;
    message += `data: ${payloadStr}\n\n`;

    const deadClientIds: string[] = [];

    for (const [clientId, client] of this.clients.entries()) {
      try {
        const rawRes = client.reply.raw;
        if (rawRes.writableEnded || rawRes.destroyed || !rawRes.writable) {
          deadClientIds.push(clientId);
          continue;
        }

        const success = rawRes.write(message);
        if (!success) {
          // Socket buffer backpressure: if destroyed or error afterwards, it will be pruned
        }
      } catch (err: any) {
        this.metrics.broadcastFailures++;
        deadClientIds.push(clientId);
      }
    }

    // Prune dead clients immediately
    for (const deadId of deadClientIds) {
      this.removeClient(deadId);
    }

    this.metrics.eventsBroadcast++;
  }

  /**
   * Sends SSE comment heartbeat (`: heartbeat\n\n`) to prevent idle timeouts.
   */
  sendHeartbeat(): void {
    const heartbeatMessage = ': heartbeat\n\n';
    const deadClientIds: string[] = [];
    const now = Date.now();

    for (const [clientId, client] of this.clients.entries()) {
      try {
        const rawRes = client.reply.raw;
        if (rawRes.writableEnded || rawRes.destroyed || !rawRes.writable) {
          deadClientIds.push(clientId);
          continue;
        }
        rawRes.write(heartbeatMessage);
        client.lastPingAt = now;
      } catch (err) {
        deadClientIds.push(clientId);
      }
    }

    for (const deadId of deadClientIds) {
      this.removeClient(deadId);
    }
  }

  /**
   * Graceful shutdown: closes all active client response streams.
   */
  closeAll(): void {
    this.stopHeartbeat();
    const shutdownMessage = 'event: shutdown\ndata: {"reason":"server_shutdown"}\n\n';

    for (const [clientId, client] of this.clients.entries()) {
      try {
        const rawRes = client.reply.raw;
        if (!rawRes.writableEnded && !rawRes.destroyed) {
          rawRes.write(shutdownMessage);
          rawRes.end();
        }
      } catch {
        // Ignore errors during mass teardown
      }
    }

    this.clients.clear();
    this.metrics.activeConnections = 0;
    logger.info('All SSE connections closed for shutdown');
  }

  /**
   * Returns current active connection count.
   */
  getConnectionCount(): number {
    return this.clients.size;
  }

  /**
   * Returns active connection count for a specific user ID to prevent socket exhaustion.
   */
  getUserConnectionCount(userId: string): number {
    let count = 0;
    for (const client of this.clients.values()) {
      if (client.userId === userId) {
        count++;
      }
    }
    return count;
  }

  /**
   * Returns manager metrics for observability.
   */
  getMetrics(): SSEManagerMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset internal metrics (useful for testing).
   */
  resetMetrics(): void {
    this.metrics = {
      activeConnections: this.clients.size,
      connectionsOpened: 0,
      connectionsClosed: 0,
      eventsBroadcast: 0,
      broadcastFailures: 0,
    };
  }
}

export const MAX_SSE_CONNECTIONS_PER_USER = 5;
export const sseManager = new SSEConnectionManager();
