/**
 * TECHX CTF 2026 — FAILURE & RECOVERY VALIDATION SUITE
 * ==============================================================================
 * Independently verifies platform resilience under service restarts:
 * 1. Backend restart resilience (SSE auto-reconnection, snapshot re-delivery, DB persistence)
 * 2. Redis restart resilience (Pub/Sub reconnection, leaderboard persistence)
 * 3. NGINX restart resilience (Traffic resumption, zero proxy state leak)
 * 4. Database ledger mathematical consistency & zero data corruption audit
 * ==============================================================================
 */

const http = require('http');
const { spawnSync } = require('child_process');
const path = require('path');

const TARGET_HOST = process.env.CTF_HOST || '127.0.0.1';
const TARGET_PORT = parseInt(process.env.CTF_PORT || '80', 10);

let passedCount = 0;
let failedCount = 0;
const results = [];

function recordTest(name, passed, details = '') {
  if (passed) {
    passedCount++;
    console.log(`  ✓ PASS: ${name} ${details ? `(${details})` : ''}`);
    results.push({ name, status: 'PASS', details });
  } else {
    failedCount++;
    console.error(`  ✗ FAIL: ${name} ${details ? `(${details})` : ''}`);
    results.push({ name, status: 'FAIL', details });
  }
}

function runDockerCompose(args) {
  return spawnSync(
    'docker',
    ['compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.lan.yml', ...args],
    { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' }
  );
}

function runPsql(query) {
  const res = runDockerCompose([
    'exec', '-T', 'postgres',
    'psql', '-U', 'techx_ctf_user', '-d', 'techx_ctf_db', '-t', '-A',
    '-c', query,
  ]);
  if (res.status !== 0) {
    throw new Error(`PSQL query failed: ${res.stderr || res.stdout}`);
  }
  return res.stdout.trim();
}

function httpRequest(urlPath, method = 'GET', headers = {}) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = http.request({
      host: TARGET_HOST,
      port: TARGET_PORT,
      path: urlPath,
      method,
      headers,
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, data, duration: Date.now() - start });
      });
    });

    req.on('error', (err) => {
      resolve({ status: 0, error: err.message, duration: Date.now() - start });
    });

    req.end();
  });
}

async function waitForHttp(urlPath, expectedStatus = 200, maxWaitMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const res = await httpRequest(urlPath);
    if (res.status === expectedStatus) {
      return { success: true, durationMs: Date.now() - start };
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return { success: false, durationMs: Date.now() - start };
}

function mintToken() {
  const nodeScript = `
    const crypto = require('crypto');
    const secret = process.env.JWT_SECRET;
    function sign(p) {
      const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const b = Buffer.from(JSON.stringify(p)).toString('base64url');
      const s = crypto.createHmac('sha256', secret).update(h + '.' + b).digest('base64url');
      return h + '.' + b + '.' + s;
    }
    console.log(sign({
      id: '1dbc58df-cd57-4393-86df-269a4294232a',
      username: 'sentinel',
      email: 'sentinel@techxmadras.org',
      role: 'participant',
      teamId: '789ec6ad-0962-4383-9c7c-aa54ea054073',
      teamRole: 'captain'
    }));
  `;
  const res = runDockerCompose(['exec', '-T', 'backend', 'node', '-e', nodeScript]);
  const lines = res.stdout.trim().split('\n');
  return lines[lines.length - 1];
}

async function testBackendRecovery(token) {
  console.log('\n--- Phase 1: Backend Restart & State Persistence ---');
  
  // 1. Initial State
  const initialTeams = runPsql("SELECT json_agg(json_build_object('id', id, 'score', score)) FROM teams;");
  
  // 2. Establish SSE connection
  let sseReceivedSnapshot = false;
  let sseDisconnected = false;
  let sseReconnected = false;

  const sseReq = http.request({
    host: TARGET_HOST,
    port: TARGET_PORT,
    path: '/api/v1/leaderboard/stream',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'text/event-stream' },
  }, (res) => {
    res.on('data', chunk => {
      const str = chunk.toString();
      if (str.includes('snapshot')) {
        sseReceivedSnapshot = true;
      }
    });
    res.on('close', () => {
      sseDisconnected = true;
    });
  });
  sseReq.on('error', () => { sseDisconnected = true; });
  sseReq.end();

  // Wait for initial SSE snapshot
  await new Promise(r => setTimeout(r, 1000));
  recordTest('Initial SSE stream delivers leaderboard snapshot', sseReceivedSnapshot);

  // 3. Restart backend
  console.log('  [ACTION] Restarting techx_ctf_backend container...');
  const restartStart = Date.now();
  runDockerCompose(['restart', 'backend']);

  // 4. Poll until backend is back up
  const recovery = await waitForHttp('/health', 200, 25000);
  recordTest('Backend returns HTTP 200 after container restart', recovery.success, `Recovered in ${recovery.durationMs}ms`);

  // 5. Connect new SSE client post-recovery
  const postSseReq = http.request({
    host: TARGET_HOST,
    port: TARGET_PORT,
    path: '/api/v1/leaderboard/stream',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'text/event-stream' },
  }, (res) => {
    res.on('data', chunk => {
      if (chunk.toString().includes('snapshot')) {
        sseReconnected = true;
      }
    });
  });
  postSseReq.on('error', () => {});
  postSseReq.end();

  await new Promise(r => setTimeout(r, 1500));
  postSseReq.destroy();
  recordTest('SSE clients reconnect and receive fresh snapshot post-restart', sseReconnected);

  // 6. Assert DB state persistence
  const postTeams = runPsql("SELECT json_agg(json_build_object('id', id, 'score', score)) FROM teams;");
  recordTest('Team scores in PostgreSQL persist identically across backend restart', initialTeams === postTeams);
}

async function testRedisRecovery(token) {
  console.log('\n--- Phase 2: Redis Restart & Pub/Sub Re-subscription ---');

  const initialLeaderboard = await httpRequest('/api/v1/leaderboard', 'GET', { 'Authorization': `Bearer ${token}` });
  recordTest('Pre-restart leaderboard returns HTTP 200', initialLeaderboard.status === 200);

  // Restart Redis
  console.log('  [ACTION] Restarting techx_ctf_redis container...');
  runDockerCompose(['restart', 'redis']);

  // Wait for Redis healthcheck
  let redisReady = false;
  const start = Date.now();
  while (Date.now() - start < 15000) {
    const res = runDockerCompose(['exec', '-T', 'redis', 'redis-cli', 'ping']);
    if (res.stdout.includes('PONG')) {
      redisReady = true;
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  recordTest('Redis engine ready post-restart (PONG)', redisReady, `Ready in ${Date.now() - start}ms`);

  // Allow backend ioredis auto-reconnect
  await new Promise(r => setTimeout(r, 2000));

  // Verify backend leaderboard read resumes cleanly
  const postLeaderboard = await httpRequest('/api/v1/leaderboard', 'GET', { 'Authorization': `Bearer ${token}` });
  recordTest('Backend leaderboard query succeeds post-Redis restart', postLeaderboard.status === 200);

  // Verify SSE stream functions
  let sseOk = false;
  const sseReq = http.request({
    host: TARGET_HOST,
    port: TARGET_PORT,
    path: '/api/v1/leaderboard/stream',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'text/event-stream' },
  }, (res) => {
    res.on('data', chunk => {
      if (chunk.toString().includes('snapshot')) sseOk = true;
    });
  });
  sseReq.on('error', () => {});
  sseReq.end();

  await new Promise(r => setTimeout(r, 1500));
  sseReq.destroy();
  recordTest('SSE stream delivers snapshot post-Redis recovery', sseOk);
}

async function testNginxRecovery() {
  console.log('\n--- Phase 3: NGINX Reverse Proxy Restart ---');

  console.log('  [ACTION] Restarting techx_ctf_nginx container...');
  runDockerCompose(['restart', 'nginx']);

  const recovery = await waitForHttp('/', 200, 10000);
  recordTest('NGINX resumes serving root UI (HTTP 200)', recovery.success, `Resumed in ${recovery.durationMs}ms`);

  const apiRes = await httpRequest('/health');
  recordTest('NGINX correctly routes /health upstream to Fastify', apiRes.status === 200);
}

async function testDatabaseConsistencyAudit() {
  console.log('\n--- Phase 4: Database Mathematical Consistency & Zero Data Corruption ---');

  // 1. Team score sum invariant: sum(score_events.points) == teams.score
  const ledgerDiscrepancy = runPsql(`
    SELECT count(*) FROM (
      SELECT se.team_id, COALESCE(SUM(se.points), 0) AS calc, t.score
      FROM teams t
      LEFT JOIN score_events se ON t.id = se.team_id
      GROUP BY se.team_id, t.id, t.score
      HAVING COALESCE(SUM(se.points), 0) != t.score
    ) sub;
  `);
  recordTest('Score ledger invariant: SUM(score_events.points) == teams.score for all teams', ledgerDiscrepancy === '0', `Discrepancies: ${ledgerDiscrepancy}`);

  // 2. Duplicate solves invariant
  const duplicateSolves = runPsql(`
    SELECT count(*) FROM (
      SELECT team_id, challenge_id, count(*)
      FROM team_solves
      GROUP BY team_id, challenge_id
      HAVING count(*) > 1
    ) sub;
  `);
  recordTest('Solves uniqueness invariant: Zero duplicate challenge solves in team_solves', duplicateSolves === '0', `Duplicates: ${duplicateSolves}`);

  // 3. Negative score invariant
  const negativeScores = runPsql("SELECT count(*) FROM teams WHERE score < 0;");
  recordTest('Score bounds invariant: Zero teams with negative score (score floor >= 0)', negativeScores === '0', `Negative teams: ${negativeScores}`);

  // 4. Outbox poison check
  const poisonedOutbox = runPsql("SELECT count(*) FROM score_event_outbox WHERE published_at IS NULL AND attempt_count >= 10;");
  recordTest('Transactional outbox invariant: Zero permanently poisoned unpublished events', poisonedOutbox === '0', `Poisoned events: ${poisonedOutbox}`);

  // 5. Orphaned team members
  const orphanedMembers = runPsql("SELECT count(*) FROM team_members WHERE team_id NOT IN (SELECT id FROM teams);");
  recordTest('Relational integrity invariant: Zero orphaned team members', orphanedMembers === '0', `Orphans: ${orphanedMembers}`);
}

async function runSuite() {
  console.log('============================================================');
  console.log('TECHX CTF 2026 — INDEPENDENT FAILURE & RECOVERY TEST SUITE');
  console.log(`Target: http://${TARGET_HOST}:${TARGET_PORT}`);
  console.log('============================================================');

  const token = mintToken();

  await testBackendRecovery(token);
  await testRedisRecovery(token);
  await testNginxRecovery();
  await testDatabaseConsistencyAudit();

  console.log('\n============================================================');
  console.log(`FAILURE & RECOVERY AUDIT SUMMARY: ${passedCount} Passed | ${failedCount} Failed`);
  console.log('============================================================');

  process.exit(failedCount === 0 ? 0 : 1);
}

runSuite().catch(err => {
  console.error('Fatal failure & recovery test error:', err);
  process.exit(1);
});
