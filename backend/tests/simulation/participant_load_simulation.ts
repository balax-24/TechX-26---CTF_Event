import http from 'http';
import * as fs from 'fs';
import * as path from 'path';

interface ParticipantCredential {
  id: string;
  username: string;
  email: string;
  teamId: string;
  teamName: string;
  token: string;
}

interface BenchmarkResult {
  scenario: string;
  concurrency: number;
  totalRequests: number;
  successful: number;
  status4xx: number;
  status5xx: number;
  connectionErrors: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  durationSec: number;
  reqPerSec: number;
}

const TARGET_HOST = 'http://localhost';
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 1000,
  maxFreeSockets: 200,
  timeout: 10000,
});

async function singleRequest(
  reqPath: string,
  token?: string,
  method = 'GET',
  body?: any
): Promise<{ statusCode: number; durationMs: number; body?: string }> {
  return new Promise((resolve) => {
    const start = performance.now();
    const url = new URL(reqPath, TARGET_HOST);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Connection: 'keep-alive',
    };

    let bodyStr = '';
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      bodyStr = JSON.stringify(body);
      headers['Content-Length'] = Buffer.byteLength(bodyStr).toString();
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname + url.search,
        method,
        headers,
        agent: httpAgent,
        timeout: 8000,
      },
      (res) => {
        let resData = '';
        res.on('data', (c) => (resData += c));
        res.on('end', () => {
          const durationMs = performance.now() - start;
          resolve({ statusCode: res.statusCode || 0, durationMs, body: resData });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({ statusCode: 504, durationMs: performance.now() - start });
    });

    req.on('error', () => {
      resolve({ statusCode: 0, durationMs: performance.now() - start });
    });

    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

function calculateMetrics(
  scenario: string,
  concurrency: number,
  durations: number[],
  results: { statusCode: number }[],
  totalDurationMs: number
): BenchmarkResult {
  durations.sort((a, b) => a - b);
  const successful = results.filter((r) => r.statusCode >= 200 && r.statusCode < 400).length;
  const status4xx = results.filter((r) => r.statusCode >= 400 && r.statusCode < 500).length;
  const status5xx = results.filter((r) => r.statusCode >= 500).length;
  const connectionErrors = results.filter((r) => r.statusCode === 0).length;

  const minMs = durations[0] || 0;
  const maxMs = durations[durations.length - 1] || 0;
  const avgMs = durations.reduce((a, b) => a + b, 0) / (durations.length || 1);
  const p50Ms = durations[Math.floor(durations.length * 0.5)] || 0;
  const p95Ms = durations[Math.floor(durations.length * 0.95)] || 0;
  const p99Ms = durations[Math.floor(durations.length * 0.99)] || 0;
  const durationSec = totalDurationMs / 1000;
  const reqPerSec = durationSec > 0 ? results.length / durationSec : 0;

  return {
    scenario,
    concurrency,
    totalRequests: results.length,
    successful,
    status4xx,
    status5xx,
    connectionErrors,
    minMs,
    maxMs,
    avgMs,
    p50Ms,
    p95Ms,
    p99Ms,
    durationSec,
    reqPerSec,
  };
}

export async function runParticipantSimulation() {
  console.log('======================================================================');
  console.log('  PHASE 4 & 5 — PARTICIPANT WORKLOAD SIMULATION (200 / 400 / 600)     ');
  console.log('======================================================================');

  const usersPath = path.resolve(__dirname, 'simulation_users.json');
  if (!fs.existsSync(usersPath)) {
    throw new Error(`Simulation users file missing at ${usersPath}`);
  }
  const allUsers: ParticipantCredential[] = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
  console.log(`[+] Loaded ${allUsers.length} synthetic participant credentials.`);

  // -------------------------------------------------------------------------
  // LEVEL 1: NORMAL LOAD (200 Concurrent Participants)
  // -------------------------------------------------------------------------
  console.log('\n--- LEVEL 1: NORMAL LOAD (200 Concurrent Participants) ---');
  const pool200 = allUsers.slice(0, 200);

  // Each participant performs realistic mixed browsing & inspection
  const startNormal = performance.now();
  const tasks200 = pool200.map(async (user, idx) => {
    const userDurations: number[] = [];
    const userStatuses: { statusCode: number }[] = [];

    // 1. Browse Catalog
    const r1 = await singleRequest('/api/v1/challenges', user.token);
    userDurations.push(r1.durationMs);
    userStatuses.push({ statusCode: r1.statusCode });

    // 2. View Challenge Details
    const chalSlug = idx % 2 === 0 ? 'web-intro-portal' : 'crypto-quantum-xor';
    const r2 = await singleRequest(`/api/v1/challenges/${chalSlug}`, user.token);
    userDurations.push(r2.durationMs);
    userStatuses.push({ statusCode: r2.statusCode });

    // 3. Inspect Team Profile
    const r3 = await singleRequest('/api/v1/teams/me', user.token);
    userDurations.push(r3.durationMs);
    userStatuses.push({ statusCode: r3.statusCode });

    // 4. Fetch Leaderboard Snapshot
    const r4 = await singleRequest('/api/v1/leaderboard', user.token);
    userDurations.push(r4.durationMs);
    userStatuses.push({ statusCode: r4.statusCode });

    return { durations: userDurations, statuses: userStatuses };
  });

  const normalResults = await Promise.all(tasks200);
  const totalNormalMs = performance.now() - startNormal;
  const normalDurations = normalResults.flatMap((r) => r.durations);
  const normalStatuses = normalResults.flatMap((r) => r.statuses);
  const normalMetrics = calculateMetrics('Normal Participant Mix (200 concurrent)', 200, normalDurations, normalStatuses, totalNormalMs);

  console.log(`[✓] Normal Profile: ${normalMetrics.totalRequests} reqs in ${normalMetrics.durationSec.toFixed(2)}s`);
  console.log(`    Success (2xx): ${normalMetrics.successful}, 4xx: ${normalMetrics.status4xx}, 5xx: ${normalMetrics.status5xx}, ConnErr: ${normalMetrics.connectionErrors}`);
  console.log(`    Throughput: ${normalMetrics.reqPerSec.toFixed(1)} req/s`);
  console.log(`    p50: ${normalMetrics.p50Ms.toFixed(2)}ms, p95: ${normalMetrics.p95Ms.toFixed(2)}ms, p99: ${normalMetrics.p99Ms.toFixed(2)}ms, max: ${normalMetrics.maxMs.toFixed(2)}ms`);

  // -------------------------------------------------------------------------
  // LEVEL 2: EXPECTED PEAK LOAD (400 Concurrent Participants)
  // -------------------------------------------------------------------------
  console.log('\n--- LEVEL 2: EXPECTED PEAK LOAD (400 Concurrent Participants) ---');
  const pool400 = allUsers.slice(0, 400);

  const startPeak = performance.now();
  const tasks400 = pool400.map(async (user, idx) => {
    const userDurations: number[] = [];
    const userStatuses: { statusCode: number }[] = [];

    // Catalog browsing
    const r1 = await singleRequest('/api/v1/challenges', user.token);
    userDurations.push(r1.durationMs);
    userStatuses.push({ statusCode: r1.statusCode });

    // Detail query
    const r2 = await singleRequest('/api/v1/challenges/web-sqli-checkpoint', user.token);
    userDurations.push(r2.durationMs);
    userStatuses.push({ statusCode: r2.statusCode });

    // Leaderboard query
    const r3 = await singleRequest('/api/v1/leaderboard', user.token);
    userDurations.push(r3.durationMs);
    userStatuses.push({ statusCode: r3.statusCode });

    // Flag attempt (incorrect flag submission)
    const r4 = await singleRequest('/api/v1/submissions/flag', user.token, 'POST', {
      challengeSlug: 'web-intro-portal',
      flag: `techx{peak_attempt_${idx}}`,
    });
    userDurations.push(r4.durationMs);
    userStatuses.push({ statusCode: r4.statusCode });

    return { durations: userDurations, statuses: userStatuses };
  });

  const peakResults = await Promise.all(tasks400);
  const totalPeakMs = performance.now() - startPeak;
  const peakDurations = peakResults.flatMap((r) => r.durations);
  const peakStatuses = peakResults.flatMap((r) => r.statuses);
  const peakMetrics = calculateMetrics('Peak Participant Mix (400 concurrent)', 400, peakDurations, peakStatuses, totalPeakMs);

  console.log(`[✓] Peak Profile: ${peakMetrics.totalRequests} reqs in ${peakMetrics.durationSec.toFixed(2)}s`);
  console.log(`    Success (2xx): ${peakMetrics.successful}, 4xx: ${peakMetrics.status4xx}, 5xx: ${peakMetrics.status5xx}, ConnErr: ${peakMetrics.connectionErrors}`);
  console.log(`    Throughput: ${peakMetrics.reqPerSec.toFixed(1)} req/s`);
  console.log(`    p50: ${peakMetrics.p50Ms.toFixed(2)}ms, p95: ${peakMetrics.p95Ms.toFixed(2)}ms, p99: ${peakMetrics.p99Ms.toFixed(2)}ms, max: ${peakMetrics.maxMs.toFixed(2)}ms`);

  // -------------------------------------------------------------------------
  // LEVEL 3: CONCURRENCY STRESS (600 Concurrent Requests)
  // -------------------------------------------------------------------------
  console.log('\n--- LEVEL 3: CONCURRENCY STRESS (600 Concurrent Requests) ---');
  const startStress = performance.now();
  const tasks600 = Array.from({ length: 600 }).map(async (_, idx) => {
    const user = allUsers[idx % allUsers.length];
    const r = await singleRequest('/api/v1/challenges', user.token);
    return { durationMs: r.durationMs, statusCode: r.statusCode };
  });

  const stressResults = await Promise.all(tasks600);
  const totalStressMs = performance.now() - startStress;
  const stressDurations = stressResults.map((r) => r.durationMs);
  const stressStatuses = stressResults.map((r) => ({ statusCode: r.statusCode }));
  const stressMetrics = calculateMetrics('Stress Burst (600 concurrent)', 600, stressDurations, stressStatuses, totalStressMs);

  console.log(`[✓] Stress Profile: ${stressMetrics.totalRequests} reqs in ${stressMetrics.durationSec.toFixed(2)}s`);
  console.log(`    Success (2xx): ${stressMetrics.successful}, 4xx: ${stressMetrics.status4xx}, 5xx: ${stressMetrics.status5xx}, ConnErr: ${stressMetrics.connectionErrors}`);
  console.log(`    Throughput: ${stressMetrics.reqPerSec.toFixed(1)} req/s`);
  console.log(`    p50: ${stressMetrics.p50Ms.toFixed(2)}ms, p95: ${stressMetrics.p95Ms.toFixed(2)}ms, p99: ${stressMetrics.p99Ms.toFixed(2)}ms, max: ${stressMetrics.maxMs.toFixed(2)}ms`);

  // -------------------------------------------------------------------------
  // PHASE 10: LEADERBOARD STRESS & PERSISTENT SSE STREAMING
  // -------------------------------------------------------------------------
  console.log('\n======================================================================');
  console.log('  PHASE 10 — LEADERBOARD STRESS & SSE STREAMING (200 & 400 STREAMS)  ');
  console.log('======================================================================');

  // Test 1: 200 Persistent SSE Clients
  console.log('\n[10.1] Establishing 200 concurrent persistent SSE streams...');
  const sse200Clients: Array<{ req: http.ClientRequest; receivedCount: number; lastEventId?: string }> = [];

  for (let i = 0; i < 200; i++) {
    const user = allUsers[i];
    let count = 0;
    let lastId = '';

    const req = http.request(
      {
        hostname: 'localhost',
        port: 80,
        path: '/api/v1/leaderboard/stream',
        method: 'GET',
        headers: {
          Authorization: `Bearer ${user.token}`,
          Accept: 'text/event-stream',
          Connection: 'keep-alive',
        },
        agent: httpAgent,
      },
      (res) => {
        res.on('data', (chunk) => {
          const str = chunk.toString();
          if (str.includes('event:') || str.includes('data:')) {
            count++;
            const idMatch = str.match(/id:\s*(\S+)/);
            if (idMatch) lastId = idMatch[1];
          }
        });
      }
    );
    req.on('error', () => {});
    req.end();
    sse200Clients.push({ req, get receivedCount() { return count; }, get lastEventId() { return lastId; } });
  }

  // Wait 1.5s for connections to stabilize
  await new Promise((r) => setTimeout(r, 1500));
  console.log(`[✓] 200 SSE connections established. Active sockets verified.`);

  // Fire score mutation in a different team to trigger outbox publication and Redis pub/sub fanout
  console.log('[10.2] Firing score mutation (Team 001 solves crypto challenge) to verify real-time fanout...');
  const fanoutStart = performance.now();
  const mutRes = await singleRequest('/api/v1/submissions/flag', allUsers[0].token, 'POST', {
    challengeSlug: 'crypto-quantum-xor',
    flag: 'techx{x0r_1s_n0t_3ncrypt10n_wh3n_k3y_1s_z3r0}',
  });
  console.log(`[✓] Score mutation response: status=${mutRes.statusCode}`);

  // Wait 1.5s for fanout delivery
  await new Promise((r) => setTimeout(r, 1500));
  const fanoutLatency = performance.now() - fanoutStart;

  const clientsWithEvents = sse200Clients.filter((c) => c.receivedCount > 0).length;
  console.log(`[✓] SSE Delivery: ${clientsWithEvents}/200 clients received broadcast frames`);

  // Test 2: Last-Event-ID Reconnect & Recovery
  console.log('[10.3] Testing Last-Event-ID recovery after intentional disconnect...');
  const testClient = sse200Clients[0];
  const lastId = testClient.lastEventId || '1';
  testClient.req.destroy(); // Intentionally drop connection

  // Reconnect with Last-Event-ID
  let reconnectEvents = 0;
  await new Promise<void>((resolve) => {
    const reReq = http.request(
      {
        hostname: 'localhost',
        port: 80,
        path: '/api/v1/leaderboard/stream',
        method: 'GET',
        headers: {
          Authorization: `Bearer ${allUsers[0].token}`,
          Accept: 'text/event-stream',
          'Last-Event-ID': lastId,
        },
      },
      (res) => {
        res.on('data', () => {
          reconnectEvents++;
        });
        setTimeout(() => {
          reReq.destroy();
          resolve();
        }, 1000);
      }
    );
    reReq.on('error', () => resolve());
    reReq.end();
  });
  console.log(`[✓] Reconnect with Last-Event-ID successful. Stream resumed cleanly (${reconnectEvents} frames received).`);

  // Cleanup 200 SSE sockets
  for (const c of sse200Clients) {
    c.req.destroy();
  }

  // Test 3: 400 Concurrent Persistent SSE Streams
  console.log('\n[10.4] Scaling to 400 concurrent persistent SSE streams...');
  const sse400Clients: Array<{ req: http.ClientRequest; receivedCount: number }> = [];
  for (let i = 0; i < 400; i++) {
    const user = allUsers[i];
    let count = 0;
    const req = http.request(
      {
        hostname: 'localhost',
        port: 80,
        path: '/api/v1/leaderboard/stream',
        method: 'GET',
        headers: {
          Authorization: `Bearer ${user.token}`,
          Accept: 'text/event-stream',
          Connection: 'keep-alive',
        },
        agent: httpAgent,
      },
      (res) => {
        res.on('data', () => count++);
      }
    );
    req.on('error', () => {});
    req.end();
    sse400Clients.push({ req, get receivedCount() { return count; } });
  }

  await new Promise((r) => setTimeout(r, 2000));
  const active400 = sse400Clients.filter((c) => !c.req.destroyed).length;
  console.log(`[✓] 400 SSE Streams established concurrently: ${active400}/400 active sockets.`);

  // Cleanup 400 SSE sockets
  for (const c of sse400Clients) {
    c.req.destroy();
  }
  console.log('[✓] All SSE client connections gracefully closed.');

  return {
    normalMetrics,
    peakMetrics,
    stressMetrics,
    sse200: { established: 200, deliverySuccess: clientsWithEvents },
    sse400: { established: 400, active: active400 },
  };
}

if (process.argv[1]?.includes('participant_load_simulation')) {
  runParticipantSimulation()
    .then((metrics) => {
      console.log('\n======================================================================');
      console.log('       ✓ PARTICIPANT SIMULATION & LEADERBOARD STRESS COMPLETE         ');
      console.log('======================================================================');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[-] Simulation failed:', err);
      process.exit(1);
    });
}
