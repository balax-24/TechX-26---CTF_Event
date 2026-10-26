const http = require('http');

function post(path, body, cookieHeader) {
  return new Promise((resolve, reject) => {
    // Extract CSRF token from cookie
    let csrfToken = '';
    if (cookieHeader) {
      const match = cookieHeader.match(/csrf_token=([^;]+)/);
      if (match) csrfToken = match[1];
    }

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    if (cookieHeader) headers['Cookie'] = cookieHeader;
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

    const req = http.request({
      host: '127.0.0.1',
      port: 80,
      path,
      method: 'POST',
      headers
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, raw: data, headers: res.headers });
        }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

function get(path, cookieHeader) {
  return new Promise((resolve, reject) => {
    const headers = { 'Accept': 'application/json' };
    if (cookieHeader) headers['Cookie'] = cookieHeader;

    const req = http.request({
      host: '127.0.0.1',
      port: 80,
      path,
      method: 'GET',
      headers
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, raw: data, headers: res.headers });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  console.log('=== PHASE 3 & 4: HINTS AND CHECKPOINTS REGRESSION SUITE ===\n');

  // 1. Login
  console.log('[1] Logging in as participant...');
  const loginRes = await post('/api/v1/auth/login', { email: 'participant@example.com', password: 'participant1234' });
  if (loginRes.status !== 200) {
    console.error('Login failed:', loginRes);
    process.exit(1);
  }
  const cookies = loginRes.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
  console.log('    Login successful.');

  // Check initial user score
  const meRes = await get('/api/v1/auth/me', cookies);
  const initialScore = meRes.data.team.score;
  console.log(`    Current Team Score: ${initialScore} PTS`);

  // 2. Test Checkpoint with Invalid Proof
  console.log('\n[2] Testing Checkpoint validation with invalid proof...');
  const cp1Id = '5033578c-c94a-4ffd-bf58-c07f881805f7';
  const invalidRes = await post(`/api/v1/checkpoints/${cp1Id}/validate`, { proof: 'wrong_secret_token' }, cookies);
  console.log('    Invalid proof response:', invalidRes.status, invalidRes.data);
  if (invalidRes.data.status !== 'incorrect') {
    console.error('FAIL: Expected status to be incorrect');
    process.exit(1);
  }
  console.log('    PASS: Invalid proof properly rejected with status: incorrect');

  // 3. Test Checkpoint Step 2 before Step 1 (Prerequisite enforcement)
  console.log('\n[3] Testing Prerequisite Enforcement (Step 2 before Step 1)...');
  const cp2Id = '258acde7-6609-43af-b6d4-db5905865160';
  const prereqRes = await post(`/api/v1/checkpoints/${cp2Id}/validate`, { proof: 'proof_step2_enum_tables' }, cookies);
  console.log('    Prerequisite response:', prereqRes.status, prereqRes.data);
  if (prereqRes.status !== 400 || !prereqRes.data.message.includes('preceding checkpoints')) {
    console.error('FAIL: Expected prerequisite rejection');
    process.exit(1);
  }
  console.log('    PASS: Prerequisite correctly enforced by server');

  // 4. Test Checkpoint Step 1 with Valid Proof
  console.log('\n[4] Testing Checkpoint Step 1 with VALID proof...');
  const validRes = await post(`/api/v1/checkpoints/${cp1Id}/validate`, { proof: 'proof_step1_extract_columns' }, cookies);
  console.log('    Valid proof response:', validRes.status, validRes.data);
  if (validRes.data.status !== 'correct' || validRes.data.success !== true || validRes.data.pointsAwarded !== 50) {
    console.error('FAIL: Expected status correct with 50 points');
    process.exit(1);
  }
  console.log('    PASS: Step 1 solved! Awarded +50 PTS. New Score:', validRes.data.newTeamScore);

  // 5. Test Duplicate Submission for Step 1
  console.log('\n[5] Testing Duplicate Submission for Step 1...');
  const dupRes = await post(`/api/v1/checkpoints/${cp1Id}/validate`, { proof: 'proof_step1_extract_columns' }, cookies);
  console.log('    Duplicate response:', dupRes.status, dupRes.data);
  if (dupRes.data.status !== 'already_completed' || dupRes.data.pointsAwarded !== 0) {
    console.error('FAIL: Expected already_completed with 0 points');
    process.exit(1);
  }
  console.log('    PASS: Duplicate checkpoint submission awarded 0 points.');

  // 6. Test Hint Unlock
  console.log('\n[6] Testing Hint Unlock (Penalty: 25 PTS)...');
  const hint1Id = 'a88dcc4c-debe-4f99-93ae-2c3dc3ceff7d';
  const hintRes = await post(`/api/v1/challenges/web-sqli-checkpoint/hints/${hint1Id}/unlock`, {}, cookies);
  console.log('    Hint unlock response:', hintRes.status, hintRes.data);
  if (!hintRes.data.success || !hintRes.data.hint.id || !hintRes.data.hint.content) {
    console.error('FAIL: Hint unlock missing id or content');
    process.exit(1);
  }
  console.log('    PASS: Hint unlocked! Content:', hintRes.data.hint.content);
  console.log('          Penalty applied:', hintRes.data.hint.penaltyPoints);
  console.log('          New Team Score:', hintRes.data.hint.newTeamScore);

  // 7. Test Duplicate Hint Purchase (Should not deduct points again)
  console.log('\n[7] Testing Duplicate Hint Purchase...');
  const dupHintRes = await post(`/api/v1/challenges/web-sqli-checkpoint/hints/${hint1Id}/unlock`, {}, cookies);
  console.log('    Duplicate hint response:', dupHintRes.status, dupHintRes.data);
  if (!dupHintRes.data.hint.alreadyUnlocked || dupHintRes.data.hint.penaltyPoints !== 0) {
    console.error('FAIL: Duplicate hint deducted penalty again!');
    process.exit(1);
  }
  console.log('    PASS: Duplicate hint purchase idempotent with 0 penalty.');

  // 8. Test Checkpoint Step 2 with Valid Proof
  console.log('\n[8] Testing Checkpoint Step 2 with VALID proof (now that Step 1 is done)...');
  const valid2Res = await post(`/api/v1/checkpoints/${cp2Id}/validate`, { proof: 'proof_step2_enum_tables' }, cookies);
  console.log('    Step 2 response:', valid2Res.status, valid2Res.data);
  if (valid2Res.data.status !== 'correct' || valid2Res.data.pointsAwarded !== 50) {
    console.error('FAIL: Expected step 2 to succeed');
    process.exit(1);
  }
  console.log('    PASS: Step 2 solved! Awarded +50 PTS. New Score:', valid2Res.data.newTeamScore);

  console.log('\n=== ALL HINT AND CHECKPOINT INVARIANTS VERIFIED! ===');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
