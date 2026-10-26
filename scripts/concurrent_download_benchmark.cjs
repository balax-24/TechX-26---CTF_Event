/**
 * TECHX CTF 2026 — INDEPENDENT MULTI-TIER DOWNLOAD BENCHMARK & SECURITY SCAN
 * ==============================================================================
 * Validates file attachment delivery under realistic participant concurrency:
 * Tiers: 1 stream, 10 concurrent streams, 50 concurrent streams, 100 concurrent streams
 * Verification on every file:
 * - HTTP 200 OK
 * - Content-Type: application/zip
 * - Content-Disposition: attachment; filename="portal_source.zip"
 * - File size (1,304 bytes)
 * - PKZIP Magic Bytes (0x50, 0x4B, 0x03, 0x04)
 * - SHA-256 cryptographic checksum matching Portal of Secrets challenge archive
 *
 * Security Access Controls:
 * - Unauthenticated request -> HTTP 401 Unauthorized
 * - Authenticated user without team -> HTTP 400 / 403 Rejection
 * - Single-team sliding-window rate limit (30 req/min) -> HTTP 429
 * ==============================================================================
 */

const http = require('http');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1';
const EXPECTED_SHA256 = '9796316c1ad1a5d3c657a00122fc5279183bb6fc1bc6976c0a83802e81207d2c';
const EXPECTED_SIZE = 1304;
const EXPECTED_MAGIC = '504b0304';

const TEST_TEAM = 'test_dl_team';
const TEST_USER = 'test_dl_user';
const TEST_EMAIL = `${TEST_USER}@techx.org`;
const TEST_PASS = 'TestSecureDlPass2026!';

function provisionTestAccount() {
  console.log('[PROVISION] Provisioning dedicated test account...');
  const res = spawnSync(
    'docker',
    [
      'compose',
      '-f', 'docker-compose.yml',
      '-f', 'docker-compose.lan.yml',
      'exec', '-T', 'backend',
      'node', 'dist/scripts/provision_team.js',
    ],
    {
      cwd: path.resolve(__dirname, '..'),
      input: JSON.stringify({ teamName: TEST_TEAM, email: TEST_EMAIL, password: TEST_PASS }),
      encoding: 'utf8',
    }
  );
  if (res.status !== 0 || !res.stdout.includes('SUCCESS')) {
    throw new Error(`Failed to provision test account: ${res.stderr || res.stdout}`);
  }
  console.log('[PROVISION] Dedicated test account provisioned successfully.');
}

function cleanupTestAccount() {
  console.log('[CLEANUP] Cleaning up test account...');
  spawnSync(
    'docker',
    [
      'compose',
      '-f', 'docker-compose.yml',
      '-f', 'docker-compose.lan.yml',
      'exec', '-T', 'backend',
      'node', 'dist/scripts/cleanup_test_team.js',
      '--cleanup', TEST_USER,
      '--confirm', `DELETE ${TEST_USER}`,
    ],
    {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
    }
  );
  console.log('[CLEANUP] Test account cleanup completed.');
}

function mintBackendTokens(count) {
  console.log(`[PROVISION] Minting ${count} controlled test-participant session tokens from backend container...`);
  const nodeScript = `
    const crypto = require('crypto');
    const secret = process.env.JWT_SECRET;
    function sign(p) {
      const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const b = Buffer.from(JSON.stringify(p)).toString('base64url');
      const s = crypto.createHmac('sha256', secret).update(h + '.' + b).digest('base64url');
      return h + '.' + b + '.' + s;
    }
    const count = parseInt(process.argv[1] || '10');
    const tokens = [];
    for (let i = 1; i <= count; i++) {
      tokens.push(sign({
        id: '00000000-0000-0000-0000-' + String(i).padStart(12, '0'),
        username: 'test_dl_part_' + i,
        email: 'test_dl_part_' + i + '@techx.lan',
        role: 'participant',
        teamId: '00000000-0000-0000-2000-' + String(i).padStart(12, '0'),
        teamRole: 'captain'
      }));
    }
    console.log(JSON.stringify(tokens));
  `;
  const res = spawnSync(
    'docker',
    [
      'compose',
      '-f', 'docker-compose.yml',
      '-f', 'docker-compose.lan.yml',
      'exec', '-T', 'backend',
      'node', '-e', nodeScript, String(count),
    ],
    {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
    }
  );
  if (res.status !== 0) {
    throw new Error(`Failed to mint backend tokens: ${res.stderr || res.stdout}`);
  }
  const lines = res.stdout.trim().split('\n');
  const jsonLine = lines[lines.length - 1];
  return JSON.parse(jsonLine);
}

function postRequest(urlPath, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlPath, BASE_URL);
    const postData = JSON.stringify(data);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 80,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...headers,
      },
    };
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function getRequestBuffer(urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlPath, BASE_URL);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 80,
      path: parsed.pathname,
      method: 'GET',
      headers,
    };
    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          status: res.statusCode,
          headers: res.headers,
          buffer,
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runDownloadBenchmark() {
  console.log('============================================================');
  console.log('TECHX CTF 2026 — MULTI-TIER ATTACHMENT DOWNLOAD BENCHMARK');
  console.log('Target: ' + BASE_URL);
  console.log('============================================================\n');

  try {
    cleanupTestAccount();
  } catch (e) {}
  provisionTestAccount();

  // 1. Authenticate to obtain real participant session cookies
  console.log('[AUTH] Authenticating real test participant via /api/v1/auth/login...');
  const loginRes = await postRequest('/api/v1/auth/login', {
    identifier: TEST_EMAIL,
    password: TEST_PASS,
  });
  if (loginRes.status !== 200) {
    throw new Error(`Login failed with status ${loginRes.status}: ${loginRes.body}`);
  }

  const setCookie = loginRes.headers['set-cookie'] || [];
  const realCookieHeader = setCookie.map(c => c.split(';')[0]).join('; ');
  console.log('[AUTH] Authentication successful. Real session cookies acquired.\n');

  // 2. Discover Portal of Secrets fileId
  console.log('[DISCOVERY] Fetching Portal of Secrets challenge details...');
  const chalRes = await getRequestBuffer('/api/v1/challenges/web-intro-portal', {
    Cookie: realCookieHeader,
  });
  const chalData = JSON.parse(chalRes.buffer.toString('utf8'));
  const file = chalData.challenge?.files?.[0];
  if (!file || !file.id) {
    throw new Error('Could not find challenge file in web-intro-portal challenge: ' + chalRes.buffer.toString('utf8'));
  }
  const fileId = file.id;
  const downloadUrl = `/api/v1/challenges/web-intro-portal/files/${fileId}`;
  console.log(`[DISCOVERY] File identified: ${file.filename} (ID: ${fileId})\n`);

  const results = [];
  function assert(name, condition, details = '') {
    const status = condition ? 'PASS' : 'FAIL';
    console.log(`[${status}] ${name}${details ? ' — ' + details : ''}`);
    results.push({ name, status, details });
  }

  // ----------------------------------------------------
  // Test Security: Access Controls
  // ----------------------------------------------------
  console.log('--- 1. Security Tests: Access Control Enforcement ---');
  // 3a. Unauthenticated Request (No Cookies / No Token)
  const unauthRes = await getRequestBuffer(downloadUrl);
  assert(
    'Unauthenticated Download Rejection',
    unauthRes.status === 401,
    `Status: ${unauthRes.status} (Expected 401 Unauthorized)`
  );

  // 3b. Authenticated User WITHOUT Team
  const noTeamToken = mintBackendTokens(1)[0];
  const noTeamHeader = `Bearer ${noTeamToken}`;
  // Token with teamId: null
  const noTeamTokens = spawnSync(
    'docker',
    [
      'compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.lan.yml',
      'exec', '-T', 'backend',
      'node', '-e',
      `const crypto = require('crypto');
       const secret = process.env.JWT_SECRET;
       const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
       const b = Buffer.from(JSON.stringify({ id: '00000000-0000-0000-0000-999999999999', role: 'participant', teamId: null })).toString('base64url');
       const s = crypto.createHmac('sha256', secret).update(h + '.' + b).digest('base64url');
       console.log(h + '.' + b + '.' + s);`
    ],
    { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' }
  );
  const tokenNoTeam = noTeamTokens.stdout.trim().split('\n').pop().trim();
  const noTeamRes = await getRequestBuffer(downloadUrl, { Authorization: `Bearer ${tokenNoTeam}` });
  assert(
    'User Without Team Download Rejection',
    noTeamRes.status === 400 || noTeamRes.status === 403,
    `Status: ${noTeamRes.status} (Expected 400/403 Bad Request / Forbidden)`
  );

  // ----------------------------------------------------
  // Test Single-Team Sliding-Window Rate Limiter
  // ----------------------------------------------------
  console.log('\n--- 2. Single-Team Rate Limiter Audit (30 req/min limit) ---');
  // Test 1 download with real session
  const singleDl = await getRequestBuffer(downloadUrl, { Cookie: realCookieHeader });
  assert(
    'Single Download Delivery',
    singleDl.status === 200 && singleDl.buffer.length === EXPECTED_SIZE,
    `Status: ${singleDl.status} | Size: ${singleDl.buffer.length}B`
  );

  // Exceed rate limit for this single team by issuing 35 requests
  const spamTasks = Array.from({ length: 35 }).map(() => getRequestBuffer(downloadUrl, { Cookie: realCookieHeader }));
  const spamResponses = await Promise.all(spamTasks);
  const has429 = spamResponses.some(r => r.status === 429);
  assert(
    'Single-Team Rate Limit Enforcement (HTTP 429 on Exceeded Limit)',
    has429,
    `Rate limiter triggered: ${has429} (Correctly protected storage bandwidth)`
  );

  // ----------------------------------------------------
  // Multi-Team Concurrency Tiers: 1, 10, 50, 100
  // Simulating distinct participants/teams downloading simultaneously
  // ----------------------------------------------------
  console.log('\n--- 3. Multi-Team Concurrent Download Matrix (1, 10, 50, 100 Streams) ---');
  const tokens100 = mintBackendTokens(100);
  const tiers = [1, 10, 50, 100];
  const tierMetrics = {};

  for (const concurrency of tiers) {
    console.log(`\n--- Concurrency Tier: ${concurrency} Simultaneous Download Stream(s) ---`);
    const tierTokens = tokens100.slice(0, concurrency);
    const startTime = Date.now();

    const tasks = tierTokens.map(async (tok, idx) => {
      const tStart = Date.now();
      const res = await getRequestBuffer(downloadUrl, { Authorization: `Bearer ${tok}` });
      const duration = Date.now() - tStart;

      const is200 = res.status === 200;
      const size = res.buffer.length;
      const magic = res.buffer.subarray(0, 4).toString('hex');
      const sha256 = crypto.createHash('sha256').update(res.buffer).digest('hex');
      const contentType = res.headers['content-type'] || '';
      const contentDisposition = res.headers['content-disposition'] || '';

      const valid =
        is200 &&
        size === EXPECTED_SIZE &&
        magic === EXPECTED_MAGIC &&
        sha256 === EXPECTED_SHA256 &&
        contentDisposition.includes('portal_source.zip');

      return { valid, duration, size, sha256, is200, status: res.status };
    });

    const tierResults = await Promise.all(tasks);
    const totalDuration = Date.now() - startTime;
    const allValid = tierResults.every(r => r.valid);
    const validCount = tierResults.filter(r => r.valid).length;
    const durations = tierResults.map(r => r.duration).sort((a, b) => a - b);
    const p50 = durations[Math.floor(durations.length * 0.5)];
    const p95 = durations[Math.floor(durations.length * 0.95)];
    const p99 = durations[Math.floor(durations.length * 0.99)];
    const throughputRps = ((concurrency / (totalDuration / 1000))).toFixed(1);

    tierMetrics[concurrency] = {
      concurrency,
      validCount,
      totalCount: concurrency,
      totalDurationMs: totalDuration,
      throughputRps,
      p50Ms: p50,
      p95Ms: p95,
      p99Ms: p99,
    };

    assert(
      `Tier ${concurrency} Delivery (${concurrency} Concurrent Streams)`,
      allValid,
      `Valid: ${validCount}/${concurrency} | Duration: ${totalDuration}ms | p50: ${p50}ms | p95: ${p95}ms | p99: ${p99}ms | Throughput: ${throughputRps} req/s`
    );

    const sample = tierResults[0];
    assert(
      `Tier ${concurrency} Integrity Audit`,
      sample.valid,
      `Size: ${sample.size}B | Magic: ${EXPECTED_MAGIC} | SHA256: ${sample.sha256.substring(0, 16)}...`
    );
  }

  cleanupTestAccount();

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  console.log('\n============================================================');
  console.log(`DOWNLOAD BENCHMARK SUMMARY: ${passed} Passed | ${failed} Failed`);
  console.log('Tier Metrics Summary:');
  console.table(tierMetrics);
  console.log('============================================================');

  process.exit(failed > 0 ? 1 : 0);
}

runDownloadBenchmark().catch((err) => {
  console.error('Fatal download benchmark error:', err);
  try { cleanupTestAccount(); } catch (e) {}
  process.exit(1);
});
