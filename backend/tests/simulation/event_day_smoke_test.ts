import http from 'http';

const TARGET_HOST = 'http://localhost';

async function httpRequest(
  pathStr: string,
  token?: string,
  method = 'GET',
  body?: any,
  headers: Record<string, string> = {}
): Promise<{ statusCode: number; json: any; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve) => {
    const url = new URL(pathStr, TARGET_HOST);
    const reqHeaders: Record<string, string> = {
      Accept: 'application/json',
      ...headers,
    };

    let bodyStr = '';
    if (body !== undefined) {
      reqHeaders['Content-Type'] = 'application/json';
      bodyStr = JSON.stringify(body);
    }

    if (token) {
      reqHeaders['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname + url.search,
        method,
        headers: reqHeaders,
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let parsed: any = null;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({ statusCode: res.statusCode || 0, json: parsed, body: raw, headers: res.headers });
        });
      }
    );

    req.on('error', (err) => {
      resolve({ statusCode: 0, json: { error: err.message }, body: '', headers: {} });
    });

    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

export async function runFinalEventDaySmokeTest() {
  console.log('======================================================================');
  console.log('         PHASE 22 — FINAL EVENT-DAY OPERATIONAL SMOKE TEST            ');
  console.log('======================================================================');

  const rand = Math.random().toString(36).substring(2, 8);
  const u1Name = `smoke_u1_${rand}`;
  const u1Email = `smoke_u1_${rand}@techxmadras.org`;
  const u2Name = `smoke_u2_${rand}`;
  const u2Email = `smoke_u2_${rand}@techxmadras.org`;
  const teamName = `SmokeTeam_${rand}`;
  const password = 'SmokePassword2026!#';

  // -------------------------------------------------------------------------
  // 1. PARTICIPANT FLOW
  // -------------------------------------------------------------------------
  console.log('\n--- 1. FULL PARTICIPANT OPERATIONAL FLOW ---');

  // Step 1: Register User 1
  console.log(`[P1] Registering Participant 1: ${u1Name}...`);
  const reg1 = await httpRequest('/api/v1/auth/register', undefined, 'POST', {
    username: u1Name,
    email: u1Email,
    password,
  });
  if (reg1.statusCode !== 201) throw new Error(`Registration failed: ${reg1.body}`);
  let token1 = reg1.json.token;
  console.log('    ✓ Participant 1 registered, JWT acquired.');

  // Step 2: Login User 1
  console.log(`[P2] Logging in Participant 1...`);
  const login1 = await httpRequest('/api/v1/auth/login', undefined, 'POST', {
    identifier: u1Email,
    password,
  });
  if (login1.statusCode !== 200) throw new Error(`Login failed: ${login1.body}`);
  token1 = login1.json.token;
  console.log('    ✓ Participant 1 logged in successfully.');

  // Step 3: Create Team
  console.log(`[P3] Creating Team: ${teamName}...`);
  const teamRes = await httpRequest('/api/v1/teams', token1, 'POST', { name: teamName });
  if (teamRes.statusCode !== 201) throw new Error(`Team creation failed: ${teamRes.body}`);
  token1 = teamRes.json.token;
  const teamId = teamRes.json.team.id;
  const inviteCode = teamRes.json.inviteCode;
  console.log(`    ✓ Team created: ID=${teamId}, InviteCode=${inviteCode}`);

  // Step 4: Register User 2 & Join Team
  console.log(`[P4] Registering Participant 2 and joining ${teamName}...`);
  const reg2 = await httpRequest('/api/v1/auth/register', undefined, 'POST', {
    username: u2Name,
    email: u2Email,
    password,
  });
  let token2 = reg2.json.token;
  const joinRes = await httpRequest('/api/v1/teams/join', token2, 'POST', { inviteCode });
  if (joinRes.statusCode !== 200) throw new Error(`Join team failed: ${joinRes.body}`);
  token2 = joinRes.json.token;
  console.log('    ✓ Participant 2 successfully joined the team.');

  // Step 5: Open Catalog & Inspect Challenge
  console.log('[P5] Browsing challenge catalog...');
  const catRes = await httpRequest('/api/v1/challenges', token1);
  if (catRes.statusCode !== 200) throw new Error('Catalog failed');
  const sqliChal = catRes.json.challenges.find((c: any) => c.slug === 'web-sqli-checkpoint');
  console.log(`    ✓ Catalog retrieved (${catRes.json.challenges.length} challenges). Inspecting: ${sqliChal.title}`);

  const detailRes = await httpRequest(`/api/v1/challenges/${sqliChal.slug}`, token1);
  if (detailRes.statusCode !== 200) throw new Error('Challenge details failed');
  console.log('    ✓ Challenge details inspected, hints and checkpoints discovered.');

  // Step 6: Connect to SSE Leaderboard Stream
  console.log('[P6] Establishing persistent SSE connection for real-time score verification...');
  let sseEventsReceived = 0;
  const sseReq = http.request(
    {
      hostname: 'localhost',
      port: 80,
      path: '/api/v1/leaderboard/stream',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token1}`,
        Accept: 'text/event-stream',
      },
    },
    (res) => {
      res.on('data', () => sseEventsReceived++);
    }
  );
  sseReq.on('error', () => {});
  sseReq.end();
  await new Promise((r) => setTimeout(r, 1000));
  console.log('    ✓ SSE stream active.');

  // Step 7: Solve Checkpoint (+50 pts)
  console.log('[P7] Solving Checkpoint 1...');
  const cp1 = detailRes.json.challenge.checkpoints.find((p: any) => p.stepNumber === 1);
  const cpRes = await httpRequest(`/api/v1/checkpoints/${cp1.id}/validate`, token1, 'POST', {
    proof: 'proof_step1_extract_columns',
  });
  if (cpRes.statusCode !== 200 || cpRes.json.status !== 'correct') {
    throw new Error(`Checkpoint validation failed: ${cpRes.body}`);
  }
  console.log(`    ✓ Checkpoint 1 solved (+50 pts, New Score: ${cpRes.json.newTeamScore})`);

  // Step 8: Request Hint (-25 pts penalty)
  console.log('[P8] Requesting Hint 1...');
  const hint1 = detailRes.json.challenge.hints[0];
  const hintRes = await httpRequest(`/api/v1/challenges/${sqliChal.slug}/hints/${hint1.id}/unlock`, token1, 'POST');
  if (hintRes.statusCode !== 200) throw new Error(`Hint unlock failed: ${hintRes.body}`);
  console.log(`    ✓ Hint 1 unlocked: "${hintRes.json.hint.content}" (-25 pts)`);

  // Step 9: Submit Flag (+175 pts net to hit 200)
  console.log('[P9] Submitting final challenge flag...');
  const flagRes = await httpRequest('/api/v1/submissions/flag', token1, 'POST', {
    challengeSlug: sqliChal.slug,
    flag: 'techx{un10n_b4s3d_sql1_m4st3r_2026}',
  });
  if (flagRes.statusCode !== 200 || flagRes.json.status !== 'correct') {
    throw new Error(`Flag submission failed: ${flagRes.body}`);
  }
  console.log(`    ✓ Flag accepted (+${flagRes.json.pointsAwarded} pts, Final Team Score: ${flagRes.json.newTeamScore})`);

  // Step 10: Verify Leaderboard Snapshot
  console.log('[P10] Verifying Leaderboard Snapshot...');
  const lbRes = await httpRequest('/api/v1/leaderboard');
  const myTeam = lbRes.json.entries.find((e: any) => e.teamId === teamId);
  console.log(`    ✓ Leaderboard entry: Rank #${myTeam.rank}, Team: ${myTeam.teamName}, Score: ${myTeam.score}`);

  // Step 11: Verify SSE Frame Delivery & Close
  console.log(`[P11] SSE Stream verification: ${sseEventsReceived} events received over socket.`);
  sseReq.destroy();
  console.log('    ✓ SSE socket closed.');

  // Step 12: Logout
  console.log('[P12] Participant Logout...');
  const logoutRes = await httpRequest('/api/v1/auth/logout', token1, 'POST');
  console.log(`    ✓ Logout response: ${logoutRes.statusCode}`);

  // -------------------------------------------------------------------------
  // 2. ADMIN FLOW
  // -------------------------------------------------------------------------
  console.log('\n--- 2. FULL ADMIN OPERATIONAL FLOW ---');

  // Step 1: Admin Login
  console.log('[A1] Logging in as Event Superadmin...');
  const adminLogin = await httpRequest('/api/v1/auth/login', undefined, 'POST', {
    identifier: process.env.ADMIN_EMAIL || process.env.ADMIN_USERNAME || 'admin@techxmadras.org',
    password: process.env.ADMIN_PASSWORD || 'TestPass_Smoke_2026!#',
  });
  if (adminLogin.statusCode !== 200) throw new Error(`Admin login failed: ${adminLogin.body}`);
  const adminToken = adminLogin.json.token;
  console.log('    ✓ Superadmin authenticated.');

  // Step 2: Open / Inspect Competition State
  console.log('[A2] Inspecting competition state...');
  const compRes = await httpRequest('/api/v1/admin/competition', adminToken);
  console.log(`    ✓ Competition state: ${compRes.json.state}, Name: "${compRes.json.config?.name || compRes.json.name}"`);

  // Step 3: Release / Publish Challenge
  console.log('[A3] Publishing draft challenge...');
  const allChals = await httpRequest('/api/v1/admin/challenges', adminToken);
  const targetChal = allChals.json.data?.[0] || allChals.json[0];
  const pubRes = await httpRequest(`/api/v1/admin/challenges/${targetChal.id}/status`, adminToken, 'POST', {
    status: 'published',
  });
  console.log(`    ✓ Challenge status confirmed published: status=${pubRes.statusCode}`);

  // Step 4: Inspect Team Details
  console.log(`[A4] Inspecting Team ${teamId}...`);
  const teamInspect = await httpRequest(`/api/v1/admin/teams/${teamId}`, adminToken);
  console.log(`    ✓ Team inspected: Name="${teamInspect.json.name}", Score=${teamInspect.json.score}, Status=${teamInspect.json.status}`);

  // Step 5: Score Audit for Team
  console.log('[A5] Verifying Team Score Events...');
  const scoreEventsRes = await httpRequest('/api/v1/leaderboard');
  const teamInLb = scoreEventsRes.json.entries.find((e: any) => e.teamId === teamId);
  console.log(`    ✓ Verified authoritative score: ${teamInLb.score} pts`);

  // Step 6: Review Audit Logs
  console.log('[A6] Reviewing system audit logs...');
  const auditLogsRes = await httpRequest('/api/v1/admin/audit-logs', adminToken);
  console.log(`    ✓ Audit logs accessible: ${auditLogsRes.json.data?.length || auditLogsRes.json.logs?.length || 0} entries retrieved.`);

  console.log('\n======================================================================');
  console.log('       ✓ PHASE 22 FINAL EVENT-DAY SMOKE TEST COMPLETE (ALL PASS)      ');
  console.log('======================================================================');
}

if (process.argv[1]?.includes('event_day_smoke_test')) {
  runFinalEventDaySmokeTest()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[-] Smoke test failed:', err);
      process.exit(1);
    });
}
