import { describe, it, expect } from 'vitest';
import { SSEConnectionManager, SSEClient } from '../../src/modules/realtime/sse.manager.js';
import { SSE_EVENT_LEADERBOARD_UPDATE } from '../../src/modules/realtime/realtime.constants.js';

interface BenchmarkedClient {
  id: string;
  client: SSEClient;
  receivedCount: number;
}

function createBenchmarkedClient(id: string): BenchmarkedClient {
  const clientData: BenchmarkedClient = {
    id,
    client: null as any,
    receivedCount: 0,
  };

  const rawRes = {
    writable: true,
    writableEnded: false,
    destroyed: false,
    write: (_chunk: string) => {
      clientData.receivedCount++;
      return true;
    },
    end: () => {
      rawRes.writableEnded = true;
    },
  };

  const reply: any = {
    raw: rawRes,
  };

  clientData.client = {
    id,
    userId: `user-${id}`,
    teamId: `team-${id}`,
    reply,
    connectedAt: new Date(),
    lastPingAt: Date.now(),
  };

  return clientData;
}

describe('Stage 5 Real-Time Leaderboard Load & Stress Benchmark', () => {
  // ---------------------------------------------------------------------------
  // SCENARIO 1: 400 Concurrent SSE Connections
  // ---------------------------------------------------------------------------
  it('Scenario 1: maintains 400 concurrent SSE connections with zero connection leaks', () => {
    const sseManager = new SSEConnectionManager();
    const initialMemory = process.memoryUsage().heapUsed;

    const clients: BenchmarkedClient[] = [];
    const connectionCount = 400;

    const startConnect = performance.now();
    for (let i = 0; i < connectionCount; i++) {
      const c = createBenchmarkedClient(`client-s1-${i}`);
      sseManager.addClient(c.client);
      clients.push(c);
    }
    const connectDurationMs = performance.now() - startConnect;

    expect(sseManager.getConnectionCount()).toBe(400);

    // Broadcast heartbeat
    const startHeartbeat = performance.now();
    sseManager.sendHeartbeat();
    const heartbeatDurationMs = performance.now() - startHeartbeat;

    for (const c of clients) {
      expect(c.receivedCount).toBe(1);
    }

    const endMemory = process.memoryUsage().heapUsed;
    const memoryDeltaMb = (endMemory - initialMemory) / (1024 * 1024);

    console.log(`[Load Test Scenario 1] 400 SSE Connections:
      - Total Connections: ${sseManager.getConnectionCount()}
      - Connect Time: ${connectDurationMs.toFixed(2)}ms (${(connectDurationMs / 400).toFixed(3)}ms/conn)
      - Heartbeat Fan-Out Time: ${heartbeatDurationMs.toFixed(2)}ms
      - Heap Delta: ${memoryDeltaMb.toFixed(2)}MB`);

    expect(heartbeatDurationMs).toBeLessThan(100); // Must be sub-100ms for 400 connections
    sseManager.closeAll();
    expect(sseManager.getConnectionCount()).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 2: 400 SSE Connections + Rapid Score Change Bursts
  // ---------------------------------------------------------------------------
  it('Scenario 2: 400 SSE connections + rapid burst of 20 score changes (8,000 deliveries)', () => {
    const sseManager = new SSEConnectionManager();
    const connectionCount = 400;
    const burstCount = 20;
    const clients: BenchmarkedClient[] = [];

    for (let i = 0; i < connectionCount; i++) {
      const c = createBenchmarkedClient(`client-s2-${i}`);
      sseManager.addClient(c.client);
      clients.push(c);
    }

    const latencies: number[] = [];

    for (let b = 0; b < burstCount; b++) {
      const eventPayload = {
        eventId: `evt-burst-${b}`,
        eventType: 'final_solve',
        teamId: `team-${b % 10}`,
        teamName: `Team ${b % 10}`,
        score: 1000 + b * 100,
        pointsDelta: 100,
        timestamp: new Date().toISOString(),
      };

      const start = performance.now();
      sseManager.broadcast(SSE_EVENT_LEADERBOARD_UPDATE, eventPayload, eventPayload.eventId);
      const latency = performance.now() - start;
      latencies.push(latency);
    }

    // Measure delivery completeness
    for (const c of clients) {
      expect(c.receivedCount).toBe(burstCount);
    }

    latencies.sort((a, b) => a - b);
    const meanLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];
    const totalDeliveries = connectionCount * burstCount;

    console.log(`[Load Test Scenario 2] 400 SSE Connections + 20 Event Bursts:
      - Total Event Deliveries: ${totalDeliveries} / ${totalDeliveries} (100% delivery)
      - Mean Fan-Out Latency: ${meanLatency.toFixed(3)}ms
      - P50 Latency: ${p50.toFixed(3)}ms
      - P95 Latency: ${p95.toFixed(3)}ms
      - P99 Latency: ${p99.toFixed(3)}ms`);

    expect(p95).toBeLessThan(50); // Sub-50ms fan-out under burst load
    expect(p99).toBeLessThan(100);

    sseManager.closeAll();
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 3: 800 SSE Connections + Rapid Score Change Bursts
  // ---------------------------------------------------------------------------
  it('Scenario 3: 800 SSE connections + rapid burst of 20 score changes (16,000 deliveries)', () => {
    const sseManager = new SSEConnectionManager();
    const connectionCount = 800;
    const burstCount = 20;
    const clients: BenchmarkedClient[] = [];

    const startConnect = performance.now();
    for (let i = 0; i < connectionCount; i++) {
      const c = createBenchmarkedClient(`client-s3-${i}`);
      sseManager.addClient(c.client);
      clients.push(c);
    }
    const connectDurationMs = performance.now() - startConnect;

    expect(sseManager.getConnectionCount()).toBe(800);

    const latencies: number[] = [];

    for (let b = 0; b < burstCount; b++) {
      const eventPayload = {
        eventId: `evt-800-burst-${b}`,
        eventType: 'checkpoint_solve',
        teamId: `team-${b % 20}`,
        teamName: `Team ${b % 20}`,
        score: 500 + b * 50,
        pointsDelta: 50,
        timestamp: new Date().toISOString(),
      };

      const start = performance.now();
      sseManager.broadcast(SSE_EVENT_LEADERBOARD_UPDATE, eventPayload, eventPayload.eventId);
      const latency = performance.now() - start;
      latencies.push(latency);
    }

    // Verify 100% delivery across all 800 clients
    for (const c of clients) {
      expect(c.receivedCount).toBe(burstCount);
    }

    latencies.sort((a, b) => a - b);
    const meanLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];
    const totalDeliveries = connectionCount * burstCount;

    console.log(`[Load Test Scenario 3] 800 SSE Connections + 20 Event Bursts:
      - Total Event Deliveries: ${totalDeliveries} / ${totalDeliveries} (100% delivery)
      - Connection Ramp-Up Time: ${connectDurationMs.toFixed(2)}ms
      - Mean Fan-Out Latency: ${meanLatency.toFixed(3)}ms
      - P50 Latency: ${p50.toFixed(3)}ms
      - P95 Latency: ${p95.toFixed(3)}ms
      - P99 Latency: ${p99.toFixed(3)}ms`);

    expect(p95).toBeLessThan(100); // Sub-100ms fan-out for 800 concurrent clients
    expect(p99).toBeLessThan(200);

    sseManager.closeAll();
    expect(sseManager.getConnectionCount()).toBe(0);
  });
});
