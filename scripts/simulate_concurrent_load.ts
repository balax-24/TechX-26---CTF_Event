import http from 'http';

interface TestStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  latencies: number[];
}

const stats: TestStats = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  latencies: [],
};

const BASE_URL = 'http://127.0.0.1:80';
const ENDPOINTS = [
  '/',
  '/api/v1/competition/state',
  '/api/v1/leaderboard',
];

function makeRequest(path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const req = http.get(`${BASE_URL}${path}`, (res) => {
      res.on('data', () => {});
      res.on('end', () => {
        const latency = Date.now() - start;
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
          stats.successfulRequests++;
          stats.latencies.push(latency);
          resolve(latency);
        } else {
          stats.failedRequests++;
          reject(new Error(`Status ${res.statusCode}`));
        }
        stats.totalRequests++;
      });
    });

    req.on('error', (err) => {
      stats.failedRequests++;
      stats.totalRequests++;
      reject(err);
    });

    req.setTimeout(5000, () => {
      req.destroy();
      stats.failedRequests++;
      stats.totalRequests++;
      reject(new Error('Timeout'));
    });
  });
}

async function simulateUser(userId: number, totalCycles: number) {
  for (let i = 0; i < totalCycles; i++) {
    for (const endpoint of ENDPOINTS) {
      try {
        await makeRequest(endpoint);
      } catch (err) {
        // logged in stats
      }
    }
  }
}

async function runLoadTest(concurrency: number, cyclesPerUser: number) {
  console.log(`\n============================================================`);
  console.log(`🚀 STARTING CONCURRENCY BENCHMARK: ${concurrency} SIMULTANEOUS USERS`);
  console.log(`Target: ${BASE_URL}`);
  console.log(`Cycles per user: ${cyclesPerUser} (Requests per user: ${cyclesPerUser * ENDPOINTS.length})`);
  console.log(`Total expected requests: ${concurrency * cyclesPerUser * ENDPOINTS.length}`);
  console.log(`============================================================`);

  const startTime = Date.now();
  const promises: Promise<void>[] = [];

  for (let i = 0; i < concurrency; i++) {
    promises.push(simulateUser(i + 1, cyclesPerUser));
  }

  await Promise.all(promises);

  const durationMs = Date.now() - startTime;
  const durationSec = durationMs / 1000;
  const avgLatency =
    stats.latencies.reduce((a, b) => a + b, 0) / (stats.latencies.length || 1);
  stats.latencies.sort((a, b) => a - b);
  const p50 = stats.latencies[Math.floor(stats.latencies.length * 0.5)] || 0;
  const p95 = stats.latencies[Math.floor(stats.latencies.length * 0.95)] || 0;
  const p99 = stats.latencies[Math.floor(stats.latencies.length * 0.99)] || 0;
  const rps = (stats.totalRequests / durationSec).toFixed(2);

  console.log(`\n📊 RESULTS:`);
  console.log(`Total Requests Sent:    ${stats.totalRequests}`);
  console.log(`Successful Requests:    ${stats.successfulRequests} (100% target)`);
  console.log(`Failed Requests:        ${stats.failedRequests} (0% target)`);
  console.log(`Total Elapsed Time:     ${durationSec.toFixed(2)}s`);
  console.log(`Throughput (Req/Sec):   ${rps} req/sec`);
  console.log(`Average Latency:        ${avgLatency.toFixed(2)} ms`);
  console.log(`P50 Latency:            ${p50} ms`);
  console.log(`P95 Latency:            ${p95} ms`);
  console.log(`P99 Latency:            ${p99} ms`);
  console.log(`============================================================\n`);

  if (stats.failedRequests === 0) {
    console.log(`✅ VERIFICATION PASSED: Platform successfully sustained ${concurrency} concurrent members!`);
  } else {
    console.error(`❌ VERIFICATION FAILED: Detected ${stats.failedRequests} failures!`);
  }
}

// Run 50 concurrent simulated users doing 5 full browsing passes each (750 total requests)
runLoadTest(50, 5);
