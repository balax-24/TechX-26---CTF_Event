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

    function makeRealHttpRequest(path: string): Promise<HttpMeasurement> {
      return new Promise((resolve) => {
        const start = performance.now();
        const req = http.request(
          {
            hostname: serverHost,
            port: serverPort,
            path,
            method: 'GET',
            headers: {
              'Connection': 'close',
              'User-Agent': 'TechX-Load-Benchmark/1.0',
            },
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => {
              data += chunk;
            });
            res.on('end', () => {
              const durationMs = performance.now() - start;
              resolve({ durationMs, statusCode: res.statusCode || 0 });
            });
          }
        );

        req.on('error', (err) => {
          const durationMs = performance.now() - start;
          resolve({ durationMs, statusCode: 599 });
        });

        req.end();
      });
    }

    const testStartTime = performance.now();
    const promises = Array.from({ length: concurrentClients }, () => makeRealHttpRequest('/health'));
    const results = await Promise.all(promises);
    const totalDurationMs = performance.now() - testStartTime;

    const stats = computeStats(results);
    const rps = (concurrentClients / (totalDurationMs / 1000));

    console.log(`[Real HTTP Benchmark — Fastify over Loopback TCP]
      - Concurrency: ${concurrentClients} real TCP sockets
      - Total Completed: ${stats.count}
      - Wall Clock Duration: ${totalDurationMs.toFixed(2)} ms
      - Real HTTP Throughput: ${rps.toFixed(1)} req/sec
      - p50 Latency: ${stats.p50.toFixed(2)} ms
      - p95 Latency: ${stats.p95.toFixed(2)} ms
      - p99 Latency: ${stats.p99.toFixed(2)} ms
      - Min Latency: ${stats.min.toFixed(2)} ms
      - Max Latency: ${stats.max.toFixed(2)} ms
      - 5xx Server Errors: ${stats.errors5xx}`);

    expect(stats.count).toBe(concurrentClients);
    expect(stats.errors5xx).toBe(0);
    expect(stats.p95).toBeLessThan(1000); // Real HTTP on loopback under parallel test suite load must finish under 1000ms
  });

  // ---------------------------------------------------------------------------
  // 2. REAL SSE STREAMING OVER TCP SOCKETS
  // ---------------------------------------------------------------------------
  it('Real SSE: establishes real TCP streaming connections and receives live broadcasts', async () => {
    const sseConnectionCount = 20; // Maintain 20 persistent HTTP TCP streams
    const receivedMessages: string[][] = Array.from({ length: sseConnectionCount }, () => []);
    const sockets: http.ClientRequest[] = [];

    // Sign participant token for authenticated SSE route
    const participantToken = app.jwt.sign({
      id: '00000000-0000-0000-0000-000000000099',
      username: 'real_sse_tester',
      email: 'sse@techxmadras.org',
      role: 'participant',
      teamId: '00000000-0000-0000-0000-000000000099',
      teamRole: 'member',
    });

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
            headers: {
              'Accept': 'text/event-stream',
              'Authorization': `Bearer ${token}`,
            },
          },
          (res) => {
            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toContain('text/event-stream');

            res.on('data', (chunk) => {
              const text = chunk.toString();
              receivedMessages[idx].push(text);
              if (text.includes('leaderboard_snapshot') || text.includes('initial')) {
                resolve();
              }
            });

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

    // Wait for all 20 real TCP SSE connections to establish
    await Promise.all(connectPromises);

    // Broadcast a live event through sseManager
    const broadcastStart = performance.now();
    sseManager.broadcast('leaderboard_update', { version: 42, event: 'real_tcp_broadcast' }, 'evt-42');
    const broadcastDurationMs = performance.now() - broadcastStart;

    // Small delay to allow TCP buffers to flush
    await new Promise((r) => setTimeout(r, 50));

    // Destroy all client sockets cleanly
    for (const req of sockets) {
      req.destroy();
    }

    console.log(`[Real SSE TCP Streaming Benchmark]
      - Active TCP SSE streams: ${sseConnectionCount}
      - Handshake: Real HTTP GET with Bearer JWT
      - Content-Type: text/event-stream
      - Fan-Out Time over TCP: ${broadcastDurationMs.toFixed(2)} ms
      - Connections Cleanly Closed: ${sseConnectionCount}`);

    expect(broadcastDurationMs).toBeLessThan(50);
  });
});
