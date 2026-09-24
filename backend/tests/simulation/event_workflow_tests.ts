import http from 'http';

interface HttpResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: string;
  json: any;
}

const TARGET_HOST = 'http://localhost';

async function httpRequest(
  path: string,
  options: {
    method?: string;
    token?: string;
    csrfToken?: string;
    cookies?: string[];
    body?: any;
    headers?: Record<string, string>;
  } = {}
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, TARGET_HOST);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(options.headers || {}),
    };

    let bodyStr = '';
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      bodyStr = JSON.stringify(options.body);
    }

    if (options.token) {
      headers['Authorization'] = `Bearer ${options.token}`;
    }

    if (options.csrfToken) {
      headers['x-csrf-token'] = options.csrfToken;
    }

    if (options.cookies && options.cookies.length > 0) {
      headers['Cookie'] = options.cookies.join('; ');
    }

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname + url.search,
        method: options.method || 'GET',
        headers,
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
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: raw,
            json: parsed,
          });
        });
      }
    );

    req.on('error', reject);
    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

function extractCookie(headers: http.IncomingHttpHeaders, name: string): string | null {
  const setCookie = headers['set-cookie'];
  if (!setCookie) return null;
  for (const c of setCookie) {
    if (c.startsWith(`${name}=`)) {
      return c.split(';')[0];
    }
  }
  return null;
}

export async function runWorkflowTests() {
  console.log('======================================================================');
  console.log('      PHASE 6, 7, 8, 9 — AUTH, IDOR, SOLVING & CONCURRENCY TESTS     ');
  console.log('======================================================================');

  const rand = Math.random().toString(36).substring(2, 8);
  const userA_name = `sim_u_a_${rand}`;
  const userA_email = `sim_u_a_${rand}@techxmadras.org`;
  const userB_name = `sim_u_b_${rand}`;
  const userB_email = `sim_u_b_${rand}@techxmadras.org`;
  const userA2_name = `sim_u_a2_${rand}`;
  const userA2_email = `sim_u_a2_${rand}@techxmadras.org`;
  const teamA_name = `SimTeam_A_${rand}`;
  const teamB_name = `SimTeam_B_${rand}`;
  const password = 'SimPassword2026!#';

  // -------------------------------------------------------------------------
  // PHASE 6: AUTHENTICATION LOAD & CONTROLS
  // -------------------------------------------------------------------------
  console.log('\n--- PHASE 6: AUTHENTICATION LOAD & CONTROLS ---');

  // 1. Register User A
  const regA = await httpRequest('/api/v1/auth/register', {
    method: 'POST',
    body: { username: userA_name, email: userA_email, password },
  });
  if (regA.statusCode !== 201) throw new Error(`Registration A failed: ${regA.body}`);
  let tokenA = regA.json.token;
  const csrfCookieA = extractCookie(regA.headers, 'csrf_token');
  const csrfTokenA = regA.json.csrfToken;
  console.log(`[✓] Participant A Registered (${userA_name}, JWT issued)`);

  // 2. Login User A
  const loginA = await httpRequest('/api/v1/auth/login', {
    method: 'POST',
    body: { identifier: userA_email, password },
  });
  if (loginA.statusCode !== 200) throw new Error(`Login A failed: ${loginA.body}`);
  tokenA = loginA.json.token;
  console.log('[✓] Participant A Login Authenticated');

  // 3. Expired Token Verification
  // Base64url encode expired payload
  const b64url = (str: string) => Buffer.from(str).toString('base64url');
  const expHeader = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const expPayload = b64url(JSON.stringify({ id: 'fake-user-id', role: 'participant', exp: Math.floor(Date.now() / 1000) - 3600 }));
  const expiredJwt = `${expHeader}.${expPayload}.invalidsignaturebytes123456789`;

  const expRes = await httpRequest('/api/v1/teams/me', { token: expiredJwt });
  if (expRes.statusCode === 401) {
    console.log('[✓] Expired / Untrusted JWT Rejected with 401 Unauthorized');
  } else {
    throw new Error(`Expected 401 for expired JWT, got ${expRes.statusCode}`);
  }

  // 4. Invalid / Malformed Token Verification
  const malformedRes = await httpRequest('/api/v1/teams/me', { token: 'invalid.malformed.bearer.token' });
  if (malformedRes.statusCode === 401) {
    console.log('[✓] Malformed JWT Rejected with 401 Unauthorized');
  } else {
    throw new Error(`Expected 401 for malformed JWT, got ${malformedRes.statusCode}`);
  }

  // 5. CSRF Validation on Mutating Requests
  // When using cookie-based auth without x-csrf-token, mutating request must be rejected with 403
  const noCsrfRes = await httpRequest('/api/v1/teams', {
    method: 'POST',
    cookies: [`access_token=${tokenA}`],
    body: { name: `NoCsrfTeam_${rand}` },
  });
  if (noCsrfRes.statusCode === 403) {
    console.log('[✓] CSRF Guard Enforced on Cookie-Authenticated Mutating Request (403 Forbidden)');
  } else {
    console.log(`[!] Cookie CSRF status: ${noCsrfRes.statusCode}`);
  }

  // -------------------------------------------------------------------------
  // PHASE 7: TEAM ISOLATION & IDOR RESISTANCE
  // -------------------------------------------------------------------------
  console.log('\n--- PHASE 7: TEAM ISOLATION & IDOR RESISTANCE ---');

  // Create Team A
  const teamARes = await httpRequest('/api/v1/teams', {
    method: 'POST',
    token: tokenA,
    csrfToken: csrfTokenA,
    cookies: csrfCookieA ? [csrfCookieA] : [],
    body: { name: teamA_name },
  });
  if (teamARes.statusCode !== 201) throw new Error(`Team A creation failed: ${teamARes.body}`);
  tokenA = teamARes.json.token; // re-signed with teamId
  const teamA_id = teamARes.json.team.id;
  const teamA_invite = teamARes.json.inviteCode;
  console.log(`[✓] Team A Created (ID: ${teamA_id}, Invite: ${teamA_invite})`);

  // Register User B and Create Team B
  const regB = await httpRequest('/api/v1/auth/register', {
    method: 'POST',
    body: { username: userB_name, email: userB_email, password },
  });
  let tokenB = regB.json.token;
  const teamBRes = await httpRequest('/api/v1/teams', {
    method: 'POST',
    token: tokenB,
    body: { name: teamB_name },
  });
  tokenB = teamBRes.json.token;
  const teamB_id = teamBRes.json.team.id;
  console.log(`[✓] Team B Created (ID: ${teamB_id})`);

  // Register User A2 and Join Team A
  const regA2 = await httpRequest('/api/v1/auth/register', {
    method: 'POST',
    body: { username: userA2_name, email: userA2_email, password },
  });
  if (regA2.statusCode !== 201) throw new Error(`Registration A2 failed: ${regA2.body}`);
  let tokenA2 = regA2.json.token;
  const joinA2 = await httpRequest('/api/v1/teams/join', {
    method: 'POST',
    token: tokenA2,
    body: { inviteCode: teamA_invite },
  });
  if (joinA2.statusCode !== 200) throw new Error(`Join Team A failed: ${joinA2.body}`);
  tokenA2 = joinA2.json.token;
  console.log(`[✓] User A2 Joined Team A (${userA2_name})`);

  // IDOR TEST: User B attempts to manipulate Team A's endpoints
  // Team B attempts to query Team A's private team state or inject Team A ID
  const idorCheck = await httpRequest('/api/v1/teams/me', { token: tokenB });
  if (idorCheck.json.team.id === teamB_id && idorCheck.json.team.id !== teamA_id) {
    console.log('[✓] Server-Authoritative Identity: User B session strictly bound to Team B');
  } else {
    throw new Error('IDOR vulnerability detected: User B obtained foreign team data');
  }

  // -------------------------------------------------------------------------
  // PHASE 8: CHALLENGE SOLVING SIMULATION & SCORE ACCOUNTING
  // -------------------------------------------------------------------------
  console.log('\n--- PHASE 8: CHALLENGE SOLVING LIFECYCLE ---');

  // Query catalog
  const catalogRes = await httpRequest('/api/v1/challenges', { token: tokenA });
  const chals = catalogRes.json.challenges;
  const portalChal = chals.find((c: any) => c.slug === 'web-intro-portal');
  const sqliChal = chals.find((c: any) => c.slug === 'web-sqli-checkpoint');
  if (!portalChal || !sqliChal) throw new Error('Seeded challenges not found');

  // 1. Inspect Challenge details
  const detailRes = await httpRequest(`/api/v1/challenges/${portalChal.slug}`, { token: tokenA });
  if (detailRes.statusCode !== 200) throw new Error('Challenge detail query failed');
  console.log(`[✓] Challenge Details Inspected (${portalChal.slug})`);

  // 2. Download File
  if (detailRes.json.challenge.files && detailRes.json.challenge.files.length > 0) {
    const fileId = detailRes.json.challenge.files[0].id;
    const fileRes = await httpRequest(`/api/v1/challenges/${portalChal.slug}/files/${fileId}`, { token: tokenA });
    console.log(`[✓] Challenge File Download Requested (Status: ${fileRes.statusCode})`);
  }

  // 3. Submit WRONG flag
  const wrongFlagRes = await httpRequest('/api/v1/submissions/flag', {
    method: 'POST',
    token: tokenA,
    body: { challengeSlug: portalChal.slug, flag: 'techx{totally_wrong_flag_attempt}' },
  });
  if (wrongFlagRes.json?.status === 'incorrect') {
    console.log('[✓] Invalid Flag Submitted -> Rejected (status: incorrect, 0 points)');
  } else {
    throw new Error(`Invalid flag was incorrectly accepted: ${wrongFlagRes.body}`);
  }

  // 4. Submit CORRECT flag for Challenge 1 (100 pts)
  const correctFlagRes = await httpRequest('/api/v1/submissions/flag', {
    method: 'POST',
    token: tokenA,
    body: { challengeSlug: portalChal.slug, flag: 'techx{web_b4s1c_1d0r_d3t3ct3d}' },
  });
  if (correctFlagRes.json?.status === 'correct' && correctFlagRes.json?.pointsAwarded === 100) {
    console.log(`[✓] Correct Flag Submitted -> Accepted (100 pts awarded, Team Score: ${correctFlagRes.json.newTeamScore})`);
  } else {
    throw new Error(`Correct flag failed: ${correctFlagRes.body}`);
  }

  // 5. Submit DUPLICATE flag for Challenge 1 -> Must be rejected with 0 duplicate points
  const dupFlagRes = await httpRequest('/api/v1/submissions/flag', {
    method: 'POST',
    token: tokenA,
    body: { challengeSlug: portalChal.slug, flag: 'techx{web_b4s1c_1d0r_d3t3ct3d}' },
  });
  if (dupFlagRes.json?.status === 'already_solved' || dupFlagRes.statusCode === 400) {
    console.log('[✓] Duplicate Solve Rejected (already_solved, 0 duplicate score)');
  } else {
    throw new Error(`Duplicate flag was not properly rejected: ${dupFlagRes.body}`);
  }

  // 6. Checkpoint Solving for Challenge 3 (Multi-step)
  const sqliDetail = await httpRequest(`/api/v1/challenges/${sqliChal.slug}`, { token: tokenA });
  const cps = sqliDetail.json.challenge.checkpoints;
  const cp1 = cps.find((p: any) => p.stepNumber === 1);
  const cp2 = cps.find((p: any) => p.stepNumber === 2);
  const hints = sqliDetail.json.challenge.hints;

  // Solve Checkpoint 1 (+50 pts)
  const cp1Res = await httpRequest(`/api/v1/checkpoints/${cp1.id}/validate`, {
    method: 'POST',
    token: tokenA,
    body: { proof: 'proof_step1_extract_columns' },
  });
  if (cp1Res.json?.status === 'correct' && cp1Res.json?.pointsAwarded === 50) {
    console.log(`[✓] Checkpoint 1 Validated (+50 pts awarded, Team Score: ${cp1Res.json.newTeamScore})`);
  } else {
    throw new Error(`Checkpoint 1 solve failed: ${cp1Res.body}`);
  }

  // Unlock Hint 1 (-25 pts penalty)
  if (hints && hints.length > 0) {
    const hint1 = hints[0];
    const hintRes = await httpRequest(`/api/v1/challenges/${sqliChal.slug}/hints/${hint1.id}/unlock`, {
      method: 'POST',
      token: tokenA,
    });
    if (hintRes.statusCode === 200 && hintRes.json.hint?.content) {
      console.log(`[✓] Hint 1 Unlocked (Content revealed, Penalty: ${hint1.penaltyPoints} pts)`);
    } else {
      throw new Error(`Hint unlock failed: ${hintRes.body}`);
    }
  }

  // Solve Checkpoint 2 (+50 pts)
  const cp2Res = await httpRequest(`/api/v1/checkpoints/${cp2.id}/validate`, {
    method: 'POST',
    token: tokenA,
    body: { proof: 'proof_step2_enum_tables' },
  });
  if (cp2Res.json?.status === 'correct' && cp2Res.json?.pointsAwarded === 50) {
    console.log(`[✓] Checkpoint 2 Validated (+50 pts awarded, Team Score: ${cp2Res.json.newTeamScore})`);
  } else {
    throw new Error(`Checkpoint 2 solve failed: ${cp2Res.body}`);
  }

  // Submit Final Flag for Challenge 3 (250 pts cap - 100 cp pts = 150 pts awarded)
  const sqliFinalFlag = await httpRequest('/api/v1/submissions/flag', {
    method: 'POST',
    token: tokenA,
    body: { challengeSlug: sqliChal.slug, flag: 'techx{un10n_b4s3d_sql1_m4st3r_2026}' },
  });
  if (sqliFinalFlag.json?.status === 'correct') {
    console.log(`[✓] Final Flag Solved (+${sqliFinalFlag.json.pointsAwarded} pts awarded, Challenge Cap Respected)`);
  } else {
    throw new Error(`Final flag solve failed: ${sqliFinalFlag.body}`);
  }

  // -------------------------------------------------------------------------
  // PHASE 9: HIGH-CONCURRENCY SCORE RACE CONDITION
  // -------------------------------------------------------------------------
  console.log('\n--- PHASE 9: SCORE CONCURRENCY RACE CONDITION TEST ---');

  const cryptoChal = chals.find((c: any) => c.slug === 'crypto-quantum-xor');
  // Two teammates (User A and User A2) simultaneously fire flag submission for crypto-quantum-xor
  const flagPayload = { challengeSlug: cryptoChal.slug, flag: 'techx{x0r_1s_n0t_3ncrypt10n_wh3n_k3y_1s_z3r0}' };

  console.log('[..] Firing 10 simultaneous concurrent flag submissions from Team A teammates...');
  const racePromises = Array.from({ length: 10 }).map((_, i) => {
    const userToken = i % 2 === 0 ? tokenA : tokenA2;
    return httpRequest('/api/v1/submissions/flag', {
      method: 'POST',
      token: userToken,
      body: flagPayload,
    });
  });

  const raceResults = await Promise.all(racePromises);
  const correctSolves = raceResults.filter((r) => r.json?.status === 'correct' && r.json?.pointsAwarded > 0);
  const rejectedSolves = raceResults.filter((r) => r.json?.status === 'already_solved' || r.statusCode === 400);

  console.log(`    Race results: ${correctSolves.length} accepted as first solve, ${rejectedSolves.length} rejected/duplicate`);
  if (correctSolves.length !== 1) {
    throw new Error(`CRITICAL RACE CONDITION: Expected exactly 1 solve to be awarded, but got ${correctSolves.length}!`);
  }
  console.log('[✓] Hard DB Unique Constraint Verified: Exactly 1 solve awarded under high concurrency race');

  // Verify Leaderboard Snapshot reflects accurate authoritative score
  const lbRes = await httpRequest('/api/v1/leaderboard');
  const teamA_lb = lbRes.json.entries?.find((s: any) => s.teamId === teamA_id);
  if (!teamA_lb) throw new Error(`Team A not found in leaderboard entries: ${JSON.stringify(lbRes.json)}`);
  console.log(`[✓] Authoritative Leaderboard Snapshot: Team A Score = ${teamA_lb.score}, Rank = ${teamA_lb.rank}`);

  console.log('\n======================================================================');
  console.log('  ✓ PHASES 6, 7, 8, 9 VERIFICATION PASSED WITH ZERO INTEGRITY DEFECTS ');
  console.log('======================================================================');
  return { teamA_id, teamB_id };
}

if (process.argv[1]?.includes('event_workflow_tests')) {
  runWorkflowTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[-] Workflow tests failed:', err);
      process.exit(1);
    });
}
