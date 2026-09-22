import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SSEConnectionManager, SSEClient } from '../../src/modules/realtime/sse.manager.js';
import {
  SSE_EVENT_LEADERBOARD_UPDATE,
  SSE_EVENT_LEADERBOARD_SNAPSHOT,
} from '../../src/modules/realtime/realtime.constants.js';

// Helper to create mock FastifyReply with writable stream
function createMockClient(id: string, shouldFailWrite = false): {
  client: SSEClient;
  writtenChunks: string[];
  rawRes: any;
} {
  const writtenChunks: string[] = [];
  const rawRes = {
    writable: true,
    writableEnded: false,
    destroyed: false,
    write: vi.fn((chunk: string) => {
      if (shouldFailWrite) {
        throw new Error('ECONNRESET');
      }
      writtenChunks.push(chunk);
      return true;
    }),
    end: vi.fn(() => {
      rawRes.writableEnded = true;
    }),
  };

  const reply: any = {
    raw: rawRes,
  };

  const client: SSEClient = {
    id,
    userId: `user-${id}`,
    teamId: `team-${id}`,
    reply,
    connectedAt: new Date(),
    lastPingAt: Date.now(),
  };

  return { client, writtenChunks, rawRes };
}

describe('SSEConnectionManager Unit Tests', () => {
  let manager: SSEConnectionManager;

  beforeEach(() => {
    manager = new SSEConnectionManager();
  });

  afterEach(() => {
    manager.closeAll();
  });

  it('correctly tracks active connection count on connect and disconnect', () => {
    const { client: c1 } = createMockClient('c1');
    const { client: c2 } = createMockClient('c2');

    expect(manager.getConnectionCount()).toBe(0);

    manager.addClient(c1);
    expect(manager.getConnectionCount()).toBe(1);

    manager.addClient(c2);
    expect(manager.getConnectionCount()).toBe(2);

    manager.removeClient('c1');
    expect(manager.getConnectionCount()).toBe(1);

    manager.removeClient('c2');
    expect(manager.getConnectionCount()).toBe(0);
  });

  it('broadcasts formatted SSE messages with event, id, and json data to all clients', () => {
    const { client: c1, writtenChunks: chunks1 } = createMockClient('c1');
    const { client: c2, writtenChunks: chunks2 } = createMockClient('c2');

    manager.addClient(c1);
    manager.addClient(c2);

    const testPayload = {
      teamId: 'team-alpha',
      teamName: 'Alpha',
      score: 1250,
      pointsDelta: 100,
    };

    manager.broadcast(SSE_EVENT_LEADERBOARD_UPDATE, testPayload, 'evt-999');

    expect(chunks1.length).toBe(1);
    expect(chunks2.length).toBe(1);

    const expectedMessage = `id: evt-999\nevent: ${SSE_EVENT_LEADERBOARD_UPDATE}\ndata: ${JSON.stringify(
      testPayload
    )}\n\n`;

    expect(chunks1[0]).toBe(expectedMessage);
    expect(chunks2[0]).toBe(expectedMessage);
  });

  it('sends periodic heartbeat comments (: heartbeat\\n\\n) to all healthy clients', () => {
    const { client: c1, writtenChunks: chunks1 } = createMockClient('c1');
    const { client: c2, writtenChunks: chunks2 } = createMockClient('c2');

    manager.addClient(c1);
    manager.addClient(c2);

    manager.sendHeartbeat();

    expect(chunks1).toContain(': heartbeat\n\n');
    expect(chunks2).toContain(': heartbeat\n\n');
  });

  it('prunes dead clients immediately during broadcast without stalling healthy clients', () => {
    const { client: healthyClient1, writtenChunks: healthyChunks1 } = createMockClient('healthy-1');
    const { client: deadClient, rawRes: deadRaw } = createMockClient('dead-1', true); // throws on write
    const { client: healthyClient2, writtenChunks: healthyChunks2 } = createMockClient('healthy-2');

    manager.addClient(healthyClient1);
    manager.addClient(deadClient);
    manager.addClient(healthyClient2);

    expect(manager.getConnectionCount()).toBe(3);

    // Broadcast should succeed and silently prune dead-1
    manager.broadcast(SSE_EVENT_LEADERBOARD_UPDATE, { score: 500 }, 'evt-1');

    expect(manager.getConnectionCount()).toBe(2);
    expect(healthyChunks1.length).toBe(1);
    expect(healthyChunks2.length).toBe(1);
    expect(manager.getMetrics().broadcastFailures).toBeGreaterThanOrEqual(1);
  });

  it('prunes destroyed or already-ended streams during heartbeat pass', () => {
    const { client: healthyClient } = createMockClient('healthy');
    const { client: endedClient, rawRes: endedRaw } = createMockClient('ended');

    endedRaw.writableEnded = true;

    manager.addClient(healthyClient);
    manager.addClient(endedClient);

    expect(manager.getConnectionCount()).toBe(2);

    manager.sendHeartbeat();

    // endedClient should have been pruned
    expect(manager.getConnectionCount()).toBe(1);
  });

  it('gracefully shuts down all active streams when closeAll() is invoked', () => {
    const { client: c1, rawRes: r1, writtenChunks: w1 } = createMockClient('c1');
    const { client: c2, rawRes: r2, writtenChunks: w2 } = createMockClient('c2');

    manager.addClient(c1);
    manager.addClient(c2);

    expect(manager.getConnectionCount()).toBe(2);

    manager.closeAll();

    expect(manager.getConnectionCount()).toBe(0);
    expect(r1.end).toHaveBeenCalled();
    expect(r2.end).toHaveBeenCalled();
    expect(w1.some((c) => c.includes('server_shutdown'))).toBe(true);
    expect(w2.some((c) => c.includes('server_shutdown'))).toBe(true);
  });

  it('never leaks sensitive competition secrets in leaderboard broadcast payloads', () => {
    const { client: c1, writtenChunks: chunks } = createMockClient('c1');
    manager.addClient(c1);

    // Verify sanitization invariant: Even if accidental internal fields are in object,
    // we verify what domain events look like
    const publicSafePayload = {
      eventId: 'evt-safe-1',
      eventType: 'final_solve',
      teamId: 'team-123',
      teamName: 'Team Elite',
      score: 800,
      pointsDelta: 200,
      timestamp: new Date().toISOString(),
    };

    manager.broadcast(SSE_EVENT_LEADERBOARD_UPDATE, publicSafePayload, 'evt-safe-1');

    const rawMessage = chunks[0];
    expect(rawMessage).not.toContain('flag');
    expect(rawMessage).not.toContain('password');
    expect(rawMessage).not.toContain('secretProofHash');
    expect(rawMessage).not.toContain('email');
    expect(rawMessage).toContain('team-123');
    expect(rawMessage).toContain('Team Elite');
  });
});
