import http from 'http';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { sseManager } from '../../src/modules/realtime/sse.manager.js';

interface HttpMeasurement {
  durationMs: number;
  statusCode: number;
}

function computeStats(measurements: HttpMeasurement[]): {
  count: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  errors5xx: number;
} {
  const latencies = measurements.map((m) => m.durationMs).sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
  const min = latencies[0] || 0;
  const max = latencies[latencies.length - 1] || 0;
  const errors5xx = measurements.filter((m) => m.statusCode >= 500).length;
  return { count: latencies.length, p50, p95, p99, min, max, errors5xx };
}

describe('Stage 10 — Real HTTP & TCP Concurrency Benchmark (Loopback)', () => {
  let app: FastifyInstance;
  let serverPort: number;
  let serverHost = '127.0.0.1';

  beforeAll(async () => {
    app = await buildApp();
    await app.listen({ port: 0, host: serverHost });
    const addr = app.server.address();
    serverPort = typeof addr === 'object' && addr ? addr.port : 4000;
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // 1. REAL HTTP CONCURRENT REQUESTS OVER TCP
  // ---------------------------------------------------------------------------
  it('Real HTTP: processes 200 concurrent real HTTP/1.1 TCP requests to Fastify', async () => {
    const concurrentClients = 200;
    const measurements: HttpMeasurement[] = [];

    // Concurrency instrumentation
    let inFlight = 0;
    let maxInFlight = 0;
    let activeSockets = 0;
    let maxActiveSockets = 0;
    let successfulConnections = 0;
    let failedConnections = 0;
    let completedResponses = 0;

    function makeRealHttpRequest(path: string): Promise<HttpMeasurement> {
      return new Promise((resolve) => {
        inFlight++;
        if (inFlight > maxInFlight) maxInFlight = inFlight;

        const start = performance.now();
        const req = http.request(
          {
            hostname: serverHost,
            port: serverPort,
            path,
            method: 'GET',
            agent: false, // Explicitly disable connection pooling: allocates a new, distinct net.Socket for every request
            headers: {
              'Connection': 'close',
              'User-Agent': 'TechX-Load-Benchmark/1.0',
            },
          },
          (res) => {
            successfulConnections++;
            let data = '';
            res.on('data', (chunk) => {
              data += chunk;
            });
            res.on('end', () => {
              completedResponses++;
              inFlight--;
              const durationMs = performance.now() - start;
              resolve({ durationMs, statusCode: res.statusCode || 0 });
            });
          }
        );

        req.on('socket', (socket) => {
          activeSockets++;
          if (activeSockets > maxActiveSockets) maxActiveSockets = activeSockets;
          socket.once('close', () => {
            activeSockets--;
          });
        });

        req.on('error', (err) => {
          failedConnections++;
          inFlight--;
          const durationMs = performance.now() - start;
          resolve({ durationMs, statusCode: 599 });
        });

        req.end();
      });
    }

    const testStartTime = performance.now();
    // Dispatch all 200 requests simultaneously
    const promises = Array.from({ length: concurrentClients }, () => makeRealHttpRequest('/health'));
    const results = await Promise.all(promises);
    const totalDurationMs = performance.now() - testStartTime;

    const stats = computeStats(results);
    const rps = (concurrentClients / (totalDurationMs / 1000));

    console.log(`[Real HTTP Benchmark — Fastify over Loopback TCP]
      - Mechanism: Node.js http.request with agent:false (independent net.Socket per request)
      - Dispatched Requests: ${concurrentClients}
      - Max In-Flight Requests: ${maxInFlight}
      - Max Concurrently Active TCP Sockets: ${maxActiveSockets}
      - Successful Connections: ${successfulConnections}
      - Failed Connections: ${failedConnections}
      - Completed Responses: ${completedResponses}
      - Wall Clock Duration: ${totalDurationMs.toFixed(2)} ms
      - Real HTTP Throughput: ${rps.toFixed(1)} req/sec (completed responses / elapsed sec)
      - p50 Latency: ${stats.p50.toFixed(2)} ms
      - p95 Latency: ${stats.p95.toFixed(2)} ms
      - p99 Latency: ${stats.p99.toFixed(2)} ms
      - Min Latency: ${stats.min.toFixed(2)} ms
      - Max Latency: ${stats.max.toFixed(2)} ms
      - 5xx Server Errors: ${stats.errors5xx}`);

    expect(stats.count).toBe(concurrentClients);
    expect(completedResponses).toBe(concurrentClients);
    expect(maxInFlight).toBeGreaterThanOrEqual(150); // Confirms genuinely concurrent dispatch
    expect(stats.errors5xx).toBe(0);
    expect(stats.p95).toBeLessThan(3000); // 200 real TCP connections under parallel multi-core test run must finish within 3000ms
  });

  // ---------------------------------------------------------------------------
  // 2. REAL SSE STREAMING OVER TCP SOCKETS
  // ---------------------------------------------------------------------------
  it('Real SSE: establishes real TCP streaming connections and receives live broadcasts', async () => {
    const sseConnectionCount = 20; // Maintain 20 persistent HTTP TCP streams
    const sockets: http.ClientRequest[] = [];
    const activeResponses: http.IncomingMessage[] = [];

    let establishedCount = 0;

    const connectPromises = Array.from({ length: sseConnectionCount }, (_, idx) => {
      return new Promise<void>((resolve, reject) => {
        // Unique user ID per connection to respect MAX_SSE_CONNECTIONS_PER_USER
        const token = app.jwt.sign({
          id: `00000000-0000-0000-0000-${String(idx + 1).padStart(12, '0')}`,
          username: `sse_user_${idx + 1}`,
          email: `user${idx + 1}@techxmadras.org`,
          role: 'participant',
          teamId: `00000000-0000-0000-0000-${String(idx + 1).padStart(12, '0')}`,
          teamRole: 'member',
        });

        const req = http.request(
          {
            hostname: serverHost,
            port: serverPort,
            path: '/api/v1/leaderboard/stream',
            method: 'GET',
            agent: false, // Dedicated socket per stream
            headers: {
              'Accept': 'text/event-stream',
              'Authorization': `Bearer ${token}`,
            },
          },
          (res) => {
            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toContain('text/event-stream');

            activeResponses.push(res);
            establishedCount++;
            resolve();
          }
        );

        req.on('error', (err) => {
          reject(err);
        });

        sockets.push(req);
        req.end();
      });
    });

    // Wait for all 20 real TCP SSE connections to fully complete HTTP handshake
    await Promise.all(connectPromises);
    expect(establishedCount).toBe(sseConnectionCount);

    // Set up network receipt listeners on all 20 client responses BEFORE broadcast
    const broadcastPayloadText = 'real_tcp_broadcast_test_event';
    const networkReceiptPromises = activeResponses.map((res) => {
      return new Promise<number>((resolve) => {
        const onData = (chunk: Buffer) => {
          const text = chunk.toString();
          if (text.includes(broadcastPayloadText)) {
            const receivedAt = performance.now();
            res.removeListener('data', onData);
            resolve(receivedAt);
          }
        };
        res.on('data', onData);
      });
    });

    // 1. In-Process Buffer-Write Timing Boundary:
    // Measures time for sseManager.broadcast() to serialize JSON and call rawRes.write() across all 20 sockets
    const broadcastCallStart = performance.now();
    sseManager.broadcast('leaderboard_update', { version: 42, event: broadcastPayloadText }, 'evt-42');
    const inProcessWriteDurationMs = performance.now() - broadcastCallStart;

    // 2. Network-Level Delivery Timing Boundary:
    // Measures time from broadcastCallStart until EVERY client receives the bytes over the TCP socket
    const clientReceiptTimes = await Promise.all(networkReceiptPromises);
    const networkDeliveryLatencies = clientReceiptTimes.map((t) => t - broadcastCallStart).sort((a, b) => a - b);
    const maxNetworkDeliveryMs = networkDeliveryLatencies[networkDeliveryLatencies.length - 1] || 0;
    const minNetworkDeliveryMs = networkDeliveryLatencies[0] || 0;
    const avgNetworkDeliveryMs = networkDeliveryLatencies.reduce((a, b) => a + b, 0) / networkDeliveryLatencies.length;
    const p50NetworkDeliveryMs = networkDeliveryLatencies[Math.floor(networkDeliveryLatencies.length * 0.5)] || 0;
    const p95NetworkDeliveryMs = networkDeliveryLatencies[Math.floor(networkDeliveryLatencies.length * 0.95)] || 0;
    const p99NetworkDeliveryMs = networkDeliveryLatencies[Math.floor(networkDeliveryLatencies.length * 0.99)] || 0;

    // Clean up all persistent streams
    for (const req of sockets) {
      req.destroy();
    }

    console.log(`[Real SSE TCP Streaming Benchmark]
      - Active TCP SSE Streams: ${sseConnectionCount}
      - HTTP Handshake: Real HTTP GET with Bearer JWT (Status 200)
      - Content-Type: text/event-stream
      - In-Process Stream Buffer Write Time: ${inProcessWriteDurationMs.toFixed(3)} ms (synchronous rawRes.write loop)
      - Actual Network TCP Delivery (Min): ${minNetworkDeliveryMs.toFixed(2)} ms
      - Actual Network TCP Delivery (Avg): ${avgNetworkDeliveryMs.toFixed(2)} ms
      - Actual Network TCP Delivery (p50): ${p50NetworkDeliveryMs.toFixed(2)} ms
      - Actual Network TCP Delivery (p95): ${p95NetworkDeliveryMs.toFixed(2)} ms
      - Actual Network TCP Delivery (p99): ${p99NetworkDeliveryMs.toFixed(2)} ms
      - Actual Network TCP Delivery (Max / All Clients): ${maxNetworkDeliveryMs.toFixed(2)} ms
      - Clients That Received Payload Over TCP: ${clientReceiptTimes.length}/${sseConnectionCount}
      - Connections Cleanly Closed: ${sseConnectionCount}`);

    // Architectural Performance Acceptance Criteria:
    // 1. In-process synchronous serialization & rawRes.write() across all 20 sockets must be strictly sub-50ms (typical <1ms, bounded under saturated parallel test workers)
    expect(inProcessWriteDurationMs).toBeLessThan(50);

    // 2. 100% of connected TCP clients must receive the broadcast payload over the network
    expect(clientReceiptTimes.length).toBe(sseConnectionCount);

    // 3. First-socket network delivery must occur immediately (<50ms)
    expect(minNetworkDeliveryMs).toBeLessThan(50);

    // 4. Test harness environment tolerance: under multi-core parallel vitest test runner CPU saturation (12 workers),
    // OS libuv thread and socket callback scheduling across all 20 distinct TCP loopback sockets must complete within 250ms
    expect(maxNetworkDeliveryMs).toBeLessThan(250);
  });
});
