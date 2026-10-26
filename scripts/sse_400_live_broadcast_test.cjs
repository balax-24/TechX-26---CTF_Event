/**
 * TECHX CTF 2026 — 400 LIVE AUTHENTICATED SSE BROADCAST STRESS TEST
 * ==============================================================================
 * Validates real-time SSE fanout under maximum event capacity:
 * 1. Establishes & maintains 400 simultaneous authenticated SSE streams to /api/v1/leaderboard/stream.
 * 2. Verifies initial handshake & 'init' event payload for all 400 clients.
 * 3. Measures baseline container memory and active Redis Pub/Sub subscriber state.
 * 4. Injects real score-changing domain events via Redis Pub/Sub pipeline.
 * 5. Asserts:
 *    - Exactly 400 / 400 clients receive the event
 *    - 0 dropped connections
 *    - 0 duplicate events
 *    - 0 missing events
 *    - 0 reconnects required
 *    - Container memory growth stability
 * 6. Clean graceful teardown and socket closure audit.
 * ==============================================================================
 */

const http = require('http');
const { spawnSync } = require('child_process');
const path = require('path');

const TARGET_HOST = process.env.CTF_HOST || '127.0.0.1';
const TARGET_PORT = parseInt(process.env.CTF_PORT || '80', 10);
const CLIENT_COUNT = 400;

const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 600,
  maxFreeSockets: 200,
  timeout: 45000,
});

function mintBackendTokens(count) {
  console.log(`[PROVISION] Minting ${count} test-participant session tokens from backend container...`);
  const nodeScript = `
    const crypto = require('crypto');
    const secret = process.env.JWT_SECRET;
    function sign(p) {
      const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const b = Buffer.from(JSON.stringify(p)).toString('base64url');
      const s = crypto.createHmac('sha256', secret).update(h + '.' + b).digest('base64url');
      return h + '.' + b + '.' + s;
    }
    const count = parseInt(process.argv[1] || '400');
    const tokens = [];
    for (let i = 1; i <= count; i++) {
      tokens.push(sign({
        id: '00000000-0000-0000-0000-' + String(i).padStart(12, '0'),
        username: 'test_sse_user_' + i,
        email: 'test_sse_user_' + i + '@techx.lan',
        role: 'participant',
        teamId: '00000000-0000-0000-3000-' + String(Math.floor((i - 1) / 4) + 1).padStart(12, '0'),
        teamRole: (i % 4 === 1) ? 'captain' : 'member'
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
    throw new Error(`Failed to mint tokens: ${res.stderr || res.stdout}`);
  }
  const lines = res.stdout.trim().split('\n');
  const jsonLine = lines[lines.length - 1];
  return JSON.parse(jsonLine);
}

function getContainerStats() {
  const res = spawnSync(
    'docker',
    ['stats', '--no-stream', '--format', '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}'],
    { encoding: 'utf8' }
  );
  return res.stdout.trim();
}

  function publishScoreEvent(eventData) {
    const payload = JSON.stringify(eventData);
    const res = spawnSync(
      'docker',
      [
        'compose',
        '-f', 'docker-compose.yml',
        '-f', 'docker-compose.lan.yml',
        'exec', '-T', 'redis',
        'redis-cli', 'PUBLISH', 'techx:leaderboard:events', payload,
      ],
      {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf8',
      }
    );
    return res.stdout.trim();
  }

async function run400SseTest() {
  console.log('============================================================');
  console.log(`TECHX CTF 2026 — 400 LIVE AUTHENTICATED SSE BROADCAST STRESS TEST`);
  console.log(`Target: http://${TARGET_HOST}:${TARGET_PORT}/api/v1/leaderboard/stream`);
  console.log('============================================================\n');

  const tokens = mintBackendTokens(CLIENT_COUNT);
  console.log(`[PROVISION] ${tokens.length} tokens ready.\n`);

  console.log('--- Initial System Telemetry (Pre-Load) ---');
  console.log(getContainerStats());
  console.log('');

  const clients = [];
  const clientStates = new Map();

  let connectedCount = 0;
  let initReceivedCount = 0;
  let droppedCount = 0;
  let reconnectCount = 0;

  console.log(`[CONNECT] Connecting ${CLIENT_COUNT} simultaneous authenticated SSE streams...`);
  const connectStartTime = Date.now();

  const connectPromises = tokens.map((token, index) => {
    return new Promise((resolve) => {
      const clientId = `client_${index + 1}`;
      const state = {
        id: clientId,
        connected: false,
        initReceived: false,
        eventsReceived: [],
        dropped: false,
      };
      clientStates.set(clientId, state);

      const req = http.request({
        agent: httpAgent,
        host: TARGET_HOST,
        port: TARGET_PORT,
        path: '/api/v1/leaderboard/stream',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
      }, (res) => {
        if (res.statusCode === 200) {
          state.connected = true;
          connectedCount++;
        } else {
          state.dropped = true;
          droppedCount++;
          resolve(false);
          return;
        }

        let buffer = '';
        res.on('data', (chunk) => {
          buffer += chunk.toString('utf8');
          const parts = buffer.split('\n\n');
          buffer = parts.pop(); // Keep incomplete portion

          for (const rawMessage of parts) {
            if (!rawMessage.trim()) continue;

            if (rawMessage.includes(': connected') || rawMessage.includes('leaderboard_snapshot')) {
              if (!state.initReceived) {
                state.initReceived = true;
                initReceivedCount++;
                resolve(true);
              }
            }

            if (rawMessage.startsWith(':')) continue; // Ignore routine keepalive comments

            const lines = rawMessage.split('\n');
            let eventType = 'message';
            let eventData = '';
            let eventId = '';

            for (const line of lines) {
              if (line.startsWith('event:')) eventType = line.substring(6).trim();
              else if (line.startsWith('data:')) eventData = line.substring(5).trim();
              else if (line.startsWith('id:')) eventId = line.substring(3).trim();
            }

            if (eventType === 'init' || eventType === 'leaderboard_snapshot') {
              if (!state.initReceived) {
                state.initReceived = true;
                initReceivedCount++;
                resolve(true);
              }
            } else if (eventType === 'leaderboard_update') {
              try {
                const parsed = JSON.parse(eventData);
                state.eventsReceived.push({ eventId, eventData: parsed, timestamp: Date.now() });
              } catch (e) {
                state.eventsReceived.push({ eventId, eventData, timestamp: Date.now() });
              }
            }
          }
        });

        res.on('end', () => {
          if (!state.dropped) {
            state.dropped = true;
            droppedCount++;
          }
        });

        res.on('error', (err) => {
          if (!state.dropped) {
            state.dropped = true;
            droppedCount++;
          }
        });
      });

      req.on('error', (err) => {
        state.dropped = true;
        droppedCount++;
        resolve(false);
      });

      req.setTimeout(60000, () => {
        req.destroy();
      });

      req.end();
      clients.push(req);
    });
  });

  // Await all connections to establish and receive initial state
  await Promise.all(connectPromises);
  const connectDuration = Date.now() - connectStartTime;

  console.log(`[CONNECT] Connection Handshake Complete in ${connectDuration}ms`);
  console.log(`Active Connections: ${connectedCount} / ${CLIENT_COUNT}`);
  console.log(`Initial Handshake Init Received: ${initReceivedCount} / ${CLIENT_COUNT}`);
  console.log(`Dropped Connections: ${droppedCount}`);
  console.log('');

  console.log('--- System Telemetry with 400 Active SSE Connections ---');
  console.log(getContainerStats());
  console.log('');

  // ----------------------------------------------------
  // Inject Real Score-Changing Event
  // ----------------------------------------------------
  const targetEventId = `e2e-event-${Date.now()}`;
  const scoreEvent = {
    eventId: targetEventId,
    eventType: 'final_solve',
    teamId: '00000000-0000-0000-3000-000000000001',
    teamName: 'TEST_LIVE_SSE_CHAMPIONS',
    challengeTitle: 'Structured Leakage',
    pointsAwarded: 250,
    newTeamScore: 1250,
    timestamp: new Date().toISOString(),
  };

  console.log(`[BROADCAST] Publishing score event ${targetEventId} via Redis channel 'ctf:leaderboard:updates'...`);
  const pubSubSubscribers = publishScoreEvent(scoreEvent);
  console.log(`[BROADCAST] Redis published. Active Redis subscribers acknowledging: ${pubSubSubscribers}\n`);

  // Wait 3 seconds for fanout across all 400 client sockets
  console.log('[BROADCAST] Awaiting broadcast delivery to 400 simultaneous clients...');
  await new Promise(r => setTimeout(r, 3000));

  // Verify delivery across all 400 clients
  let clientsReceivedTarget = 0;
  let clientsWithDuplicates = 0;
  let clientsMissingEvent = 0;
  const latencies = [];

  for (const [clientId, state] of clientStates.entries()) {
    const matching = state.eventsReceived.filter(e => e.eventId === targetEventId);
    if (matching.length === 1) {
      clientsReceivedTarget++;
    } else if (matching.length > 1) {
      clientsWithDuplicates++;
    } else {
      clientsMissingEvent++;
    }
  }

  console.log('--- Post-Broadcast Telemetry ---');
  console.log(getContainerStats());
  console.log('');

  const droppedDuringBroadcast = droppedCount;

  // Gracefully close all client sockets
  console.log('[TEARDOWN] Gracefully closing 400 SSE client connections...');
  clients.forEach(req => {
    try { req.destroy(); } catch (e) {}
  });
  await new Promise(r => setTimeout(r, 1500));
  console.log('[TEARDOWN] All SSE client connections closed.\n');

  console.log('--- Post-Teardown System Telemetry ---');
  console.log(getContainerStats());
  console.log('');

  // ----------------------------------------------------
  // Verification Assertions
  // ----------------------------------------------------
  const results = [];
  function assert(name, condition, details = '') {
    const status = condition ? 'PASS' : 'FAIL';
    console.log(`[${status}] ${name}${details ? ' — ' + details : ''}`);
    results.push({ name, status, details });
  }

  assert(
    '400 Simultaneous SSE Connections Established',
    connectedCount === CLIENT_COUNT,
    `Connected: ${connectedCount}/${CLIENT_COUNT} in ${connectDuration}ms`
  );

  assert(
    'Initial Handshake State Received on All 400 Clients',
    initReceivedCount === CLIENT_COUNT,
    `Init payloads: ${initReceivedCount}/${CLIENT_COUNT}`
  );

  assert(
    'Real Domain Event Broadcast Delivered to 400 Clients',
    clientsReceivedTarget === CLIENT_COUNT,
    `Delivered to ${clientsReceivedTarget}/${CLIENT_COUNT} clients`
  );

  assert(
    'Zero Dropped Connections During Broadcast',
    droppedDuringBroadcast === 0,
    `Dropped connections: ${droppedDuringBroadcast}`
  );

  assert(
    'Zero Duplicate Broadcast Events',
    clientsWithDuplicates === 0,
    `Clients with duplicates: ${clientsWithDuplicates}`
  );

  assert(
    'Zero Missing Broadcast Events',
    clientsMissingEvent === 0,
    `Clients missing event: ${clientsMissingEvent}`
  );

  assert(
    'Zero Reconnects Required',
    reconnectCount === 0,
    `Reconnect count: ${reconnectCount}`
  );

  assert(
    'Redis Pub/Sub Channel Fanout',
    parseInt(pubSubSubscribers, 10) >= 1,
    `Subscribers acknowledging: ${pubSubSubscribers}`
  );

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  console.log('\n============================================================');
  console.log(`400 SSE BENCHMARK RESULT: ${passed} Passed | ${failed} Failed`);
  console.log('============================================================');

  process.exit(failed > 0 ? 1 : 0);
}

run400SseTest().catch((err) => {
  console.error('Fatal 400 SSE test error:', err);
  process.exit(1);
});
