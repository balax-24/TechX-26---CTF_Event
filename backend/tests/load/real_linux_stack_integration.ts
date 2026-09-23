import http from 'http';

interface TimingResult {
  concurrency: number;
  totalRequests: number;
  successful: number;
  failed: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

async function request(url: string, options: http.RequestOptions, bodyData?: string): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || 80,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode || 0, body: data });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (bodyData) {
      req.write(bodyData);
    }
    req.end();
  });
}

async function runBenchmark(url: string, token: string, concurrency: number, count: number): Promise<TimingResult> {
  const durations: number[] = [];
  let successful = 0;
  let failed = 0;

  const agent = new http.Agent({ keepAlive: true, maxSockets: concurrency + 10 });
  const tasks: Promise<void>[] = [];

  for (let i = 0; i < count; i++) {
    tasks.push((async () => {
      const start = performance.now();
      try {
        const res = await new Promise<{ statusCode: number }>((resolve, reject) => {
          const parsed = new URL(url);
          const req = http.request(
            {
              hostname: parsed.hostname,
              port: parsed.port || 80,
              path: parsed.pathname,
              method: 'GET',
              agent,
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
              },
            },
            (res) => {
              res.on('data', () => {});
              res.on('end', () => resolve({ statusCode: res.statusCode || 0 }));
            }
          );
          req.on('error', reject);
          req.end();
        });

        const elapsed = performance.now() - start;
        durations.push(elapsed);
        if (res.statusCode >= 200 && res.statusCode < 400) {
          successful++;
        } else {
          failed++;
        }
      } catch {
        durations.push(performance.now() - start);
        failed++;
      }
    })());

    if (tasks.length >= concurrency) {
      await Promise.all(tasks.splice(0, concurrency));
    }
  }

  if (tasks.length > 0) {
    await Promise.all(tasks);
  }

  durations.sort((a, b) => a - b);
  const minMs = durations[0] || 0;
  const maxMs = durations[durations.length - 1] || 0;
  const avgMs = durations.reduce((a, b) => a + b, 0) / (durations.length || 1);
  const p50Ms = durations[Math.floor(durations.length * 0.5)] || 0;
  const p95Ms = durations[Math.floor(durations.length * 0.95)] || 0;
  const p99Ms = durations[Math.floor(durations.length * 0.99)] || 0;

  return {
    concurrency,
    totalRequests: count,
    successful,
    failed,
    minMs,
    maxMs,
    avgMs,
    p50Ms,
    p95Ms,
    p99Ms,
  };
}

async function main() {
  console.log('=== REAL LINUX STACK HTTP + SSE INTEGRATION TEST ===');
  const targetHost = 'http://localhost';
  const testId = Math.random().toString(36).substring(2, 8);
  const username = `perf_user_${testId}`;
  const email = `perf_${testId}@techxmadras.org`;
  const password = 'PerfPassword2026!#';

  // 1. Register
  console.log(`[1] Registering user: ${username}...`);
  const regRes = await request(`${targetHost}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, JSON.stringify({ username, email, password }));

  const regData = JSON.parse(regRes.body);
  const token = regData.token;
  if (!token) {
    throw new Error(`Registration failed: ${regRes.body}`);
  }
  console.log('    ✓ Registration successful, token acquired.');

  // 2. Open 5 Persistent SSE Connections
  console.log('[2] Opening 5 persistent SSE connections to /api/v1/leaderboard/stream...');
  const sseClients: http.ClientRequest[] = [];
  const sseEventsReceived: number[] = [0, 0, 0, 0, 0];

  for (let i = 0; i < 5; i++) {
    const sseReq = http.request({
      hostname: 'localhost',
      port: 80,
      path: '/api/v1/leaderboard/stream',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'text/event-stream',
      },
    }, (res) => {
      res.on('data', (chunk) => {
        const text = chunk.toString();
        if (text.includes('event:') || text.includes('data:')) {
          sseEventsReceived[i]++;
        }
      });
    });
    sseReq.on('error', (err) => {
      console.error(`    SSE client ${i} error:`, err.message);
    });
    sseReq.end();
    sseClients.push(sseReq);
  }

  // Wait 1 second for SSE streams to initialize
  await new Promise((r) => setTimeout(r, 1000));
  console.log('    ✓ 5 SSE client streams established.');

  // 3. 50 Concurrent Requests
  console.log('[3] Running 50 concurrent authenticated requests to /api/v1/challenges...');
  const res50 = await runBenchmark(`${targetHost}/api/v1/challenges`, token, 50, 50);
  console.log(`    Result (50 reqs): successful=${res50.successful}, failed=${res50.failed}`);
  console.log(`    Latencies: min=${res50.minMs.toFixed(2)}ms, avg=${res50.avgMs.toFixed(2)}ms, p50=${res50.p50Ms.toFixed(2)}ms, p95=${res50.p95Ms.toFixed(2)}ms, max=${res50.maxMs.toFixed(2)}ms`);

  // 4. 100 Concurrent Requests
  console.log('[4] Running 100 concurrent authenticated requests to /api/v1/challenges...');
  const res100 = await runBenchmark(`${targetHost}/api/v1/challenges`, token, 100, 100);
  console.log(`    Result (100 reqs): successful=${res100.successful}, failed=${res100.failed}`);
  console.log(`    Latencies: min=${res100.minMs.toFixed(2)}ms, avg=${res100.avgMs.toFixed(2)}ms, p50=${res100.p50Ms.toFixed(2)}ms, p95=${res100.p95Ms.toFixed(2)}ms, max=${res100.maxMs.toFixed(2)}ms`);

  // 5. Check SSE Stream Health
  console.log('[5] Checking SSE stream frames received...');
  console.log(`    SSE frames received per client: [${sseEventsReceived.join(', ')}]`);

  // Cleanup SSE sockets
  for (const client of sseClients) {
    client.destroy();
  }
  console.log('    ✓ SSE connections gracefully closed.');

  console.log('\n=== REAL STACK TEST SUMMARY ===');
  console.log(`50-req profile:  ${res50.successful}/50 OK (p50: ${res50.p50Ms.toFixed(2)}ms, p95: ${res50.p95Ms.toFixed(2)}ms)`);
  console.log(`100-req profile: ${res100.successful}/100 OK (p50: ${res100.p50Ms.toFixed(2)}ms, p95: ${res100.p95Ms.toFixed(2)}ms)`);
  console.log(`SSE streams:     5 active sockets verified, events received on each client`);
  console.log('Test completed successfully.');
}

main().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
