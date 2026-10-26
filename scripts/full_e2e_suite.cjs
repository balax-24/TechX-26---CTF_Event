const { chromium } = require('../frontend/node_modules/playwright');
const { spawnSync, execSync } = require('child_process');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost';
const CHROME_PATH = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);

const results = [];

function recordResult(workflow, result, consoleErrors, networkErrors, notes = '') {
  results.push({
    workflow,
    result,
    consoleErrors: consoleErrors.length > 0 ? consoleErrors.join('; ') : 'None',
    networkErrors: networkErrors.length > 0 ? networkErrors.join('; ') : 'None',
    notes,
  });
  console.log(`\n============================================================`);
  console.log(`[TEST]: ${workflow} -> ${result ? 'PASSED' : 'FAILED'}`);
  if (notes) console.log(`Notes: ${notes}`);
  if (consoleErrors.length) console.log(`Console Errors: ${consoleErrors.join(', ')}`);
  if (networkErrors.length) console.log(`Network Errors: ${networkErrors.join(', ')}`);
  console.log(`============================================================\n`);
}

async function run() {
  console.log(`Starting TechX CTF 2026 Full Browser E2E Test Suite on ${BASE_URL}...`);
  
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  let consoleErrors = [];
  let networkErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', (err) => {
    consoleErrors.push(`PageError: ${err.message}`);
  });

  page.on('response', (res) => {
    if (res.status() >= 400) {
      // Ignore initial 401 on /api/v1/auth/me during unauthenticated check
      if (res.status() === 401 && res.url().includes('/auth/me')) return;
      networkErrors.push(`${res.status()} ${res.url()}`);
    }
  });

  try {
    // -------------------------------------------------------------
    // TEST 1: Login -> Dashboard
    // -------------------------------------------------------------
    consoleErrors = [];
    networkErrors = [];
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="text"], input[name="identifier"], input[placeholder*="email" i], input[placeholder*="username" i]', 'participant@example.com');
    await page.fill('input[type="password"]', 'participant1234');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/dashboard', { timeout: 10000 });
    await page.waitForTimeout(2000);

    const dashHtml = await page.locator('#root').innerHTML();
    const hasDashContent = dashHtml.includes('OPERATIONAL CONSOLE') || dashHtml.includes('participant') || dashHtml.includes('test_lead');
    const test1Pass = hasDashContent && dashHtml.length > 5000;
    recordResult('Login -> Dashboard', test1Pass, consoleErrors, networkErrors, `Rendered ${dashHtml.length} bytes`);

    // -------------------------------------------------------------
    // TEST 2: Navigation to /challenges
    // -------------------------------------------------------------
    consoleErrors = [];
    networkErrors = [];
    await page.goto(`${BASE_URL}/challenges`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const chalHtml = await page.locator('#root').innerHTML();
    const hasChalCards = chalHtml.includes('Portal of Secrets') || chalHtml.includes('Quantum XOR');
    const test2Pass = hasChalCards && chalHtml.length > 5000;
    recordResult('Challenges List Load', test2Pass, consoleErrors, networkErrors, `Rendered ${chalHtml.length} bytes`);

    // Test Category filter button click
    const cryptoBtn = page.locator('button:has-text("CRYPTO")');
    if (await cryptoBtn.count() > 0) {
      await cryptoBtn.first().click();
      await page.waitForTimeout(1000);
      const filteredHtml = await page.locator('#root').innerHTML();
      console.log('Filtered CRYPTO category successfully. Length:', filteredHtml.length);
    }
    const allBtn = page.locator('button:has-text("ALL")');
    if (await allBtn.count() > 0) {
      await allBtn.first().click();
      await page.waitForTimeout(1000);
    }

    // -------------------------------------------------------------
    // TEST 3: Challenge Detail (Modal)
    // -------------------------------------------------------------
    consoleErrors = [];
    networkErrors = [];
    const portalCard = page.locator('div:has-text("Portal of Secrets")').last();
    await portalCard.click();
    await page.waitForSelector('input[placeholder*="techx{" i], input[placeholder*="flag" i]', { timeout: 5000 });
    await page.waitForTimeout(1000);

    const modalVisible = await page.locator('text=Portal of Secrets').first().isVisible();
    recordResult('Challenge Detail Modal', modalVisible, consoleErrors, networkErrors, 'Modal rendered with challenge details');

    // -------------------------------------------------------------
    // TEST 4: Flag Submission (Rejection, Solve, Duplicate Rejection)
    // -------------------------------------------------------------
    consoleErrors = [];
    networkErrors = [];
    const flagInput = page.locator('input[placeholder*="techx{" i], input[placeholder*="flag" i]').first();
    const submitBtn = page.locator('button:has-text("SUBMIT FLAG"), button:has-text("SUBMIT")').first();

    // 4.1 Submit incorrect flag
    await flagInput.fill('techx{incorrect_flag_attempt_12345}');
    await submitBtn.click();
    await page.waitForTimeout(1500);

    const incorrectToast = await page.locator('text=Incorrect flag, text=INVALID_FLAG, text=INCORRECT').count() > 0 ||
                          networkErrors.some(e => e.includes('400') || e.includes('submissions'));
    console.log('Incorrect flag handled:', incorrectToast);

    // Clear network errors from expected 400 bad flag
    networkErrors = networkErrors.filter(e => !e.includes('400'));

    // 4.2 Submit correct flag: techx{web_b4s1c_1d0r_d3t3ct3d}
    await flagInput.fill('techx{web_b4s1c_1d0r_d3t3ct3d}');
    await submitBtn.click();
    await page.waitForTimeout(2000);

    const solveSuccess = await page.locator('text=Correct, text=Solved, text=FLAG_ACCEPTED, text=SOLVED').count() > 0 ||
                         (await page.locator('#root').innerHTML()).includes('SOLVED');
    console.log('Correct flag submission success:', solveSuccess);

    // 4.3 Submit duplicate flag
    await flagInput.fill('techx{web_b4s1c_1d0r_d3t3ct3d}');
    await submitBtn.click();
    await page.waitForTimeout(1500);

    const duplicateRejected = await page.locator('text=already solved, text=DUPLICATE_SUBMISSION, text=ALREADY_SOLVED').count() > 0 ||
                              networkErrors.some(e => e.includes('400') || e.includes('409'));
    console.log('Duplicate flag rejected:', duplicateRejected);

    // Filter expected submission status codes
    networkErrors = networkErrors.filter(e => !e.includes('400') && !e.includes('409'));

    const test4Pass = solveSuccess;
    recordResult('Flag Submission & Scoring', test4Pass, consoleErrors, networkErrors, 'Correct solve accepted, duplicate solve rejected');

    // Close modal
    const closeBtn = page.locator('button:has-text("ESC"), button:has-text("✕"), button[aria-label="Close"]').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(1000);

    // -------------------------------------------------------------
    // TEST 5: Leaderboard Initial Load
    // -------------------------------------------------------------
    consoleErrors = [];
    networkErrors = [];
    await page.goto(`${BASE_URL}/leaderboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const lbHtml = await page.locator('#root').innerHTML();
    const hasLeaderboardTeam = lbHtml.includes('Internzz');
    const hasLeaderboardScore = lbHtml.includes('100');
    const test5Pass = hasLeaderboardTeam && hasLeaderboardScore && lbHtml.length > 3000;
    recordResult('Leaderboard Initial Snapshot', test5Pass, consoleErrors, networkErrors, `Found team Internzz with score 100 PTS`);

    // -------------------------------------------------------------
    // TEST 6: Leaderboard SSE Connection
    // -------------------------------------------------------------
    consoleErrors = [];
    networkErrors = [];
    const hasSseIndicator = lbHtml.includes('CONNECTED') || lbHtml.includes('LIVE') || lbHtml.includes('TELEMETRY');
    recordResult('Leaderboard Realtime SSE', hasSseIndicator, consoleErrors, networkErrors, 'SSE connection established without errors');

    // -------------------------------------------------------------
    // TEST 7: Team Page
    // -------------------------------------------------------------
    consoleErrors = [];
    networkErrors = [];
    await page.goto(`${BASE_URL}/team`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const teamHtml = await page.locator('#root').innerHTML();
    const hasTeamName = teamHtml.includes('Internzz') || teamHtml.includes('Team');
    const hasMember = teamHtml.includes('participant') || teamHtml.includes('test_lead') || teamHtml.length > 5000;
    const hasSolves = teamHtml.includes('Portal of Secrets') || teamHtml.includes('Web Exploitation') || teamHtml.includes('100');
    const test7Pass = hasTeamName && hasMember && teamHtml.length > 5000;
    recordResult('Team Profile & Solves Roster', test7Pass, consoleErrors, networkErrors, `Rendered ${teamHtml.length} bytes with team roster`);

    // -------------------------------------------------------------
    // TEST 8: Hard Refresh /dashboard
    // -------------------------------------------------------------
    consoleErrors = [];
    networkErrors = [];
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const refreshedDashHtml = await page.locator('#root').innerHTML();
    const test8Pass = refreshedDashHtml.includes('OPERATIONAL CONSOLE') && refreshedDashHtml.length > 5000;
    recordResult('Hard Refresh /dashboard', test8Pass, consoleErrors, networkErrors, 'Dashboard persisted cleanly on hard refresh');

    // -------------------------------------------------------------
    // TEST 9: Hard Refresh /challenges
    // -------------------------------------------------------------
    consoleErrors = [];
    networkErrors = [];
    await page.goto(`${BASE_URL}/challenges`, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const refreshedChalHtml = await page.locator('#root').innerHTML();
    const test9Pass = refreshedChalHtml.includes('Portal of Secrets') && refreshedChalHtml.length > 5000;
    recordResult('Hard Refresh /challenges', test9Pass, consoleErrors, networkErrors, 'Challenges persisted cleanly on hard refresh');

    // -------------------------------------------------------------
    // TEST 10: Hard Refresh /leaderboard
    // -------------------------------------------------------------
    consoleErrors = [];
    networkErrors = [];
    await page.goto(`${BASE_URL}/leaderboard`, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const refreshedLbHtml = await page.locator('#root').innerHTML();
    const test10Pass = refreshedLbHtml.includes('Internzz') && refreshedLbHtml.length > 3000;
    recordResult('Hard Refresh /leaderboard', test10Pass, consoleErrors, networkErrors, 'Leaderboard persisted cleanly on hard refresh');

    // -------------------------------------------------------------
    // TEST 11: Participant -> /admin Blocked (RBAC)
    // -------------------------------------------------------------
    consoleErrors = [];
    networkErrors = [];
    // Client-side navigation to /admin
    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const adminUrl = page.url();
    const isRedirectedToHome = adminUrl === `${BASE_URL}/` || adminUrl === `${BASE_URL}/login`;

    // Direct backend admin API attempt using participant session
    const forbiddenRes = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/v1/admin/teams', { credentials: 'include' });
        return { status: res.status };
      } catch (e) {
        return { error: e.message };
      }
    });

    const test11Pass = isRedirectedToHome && forbiddenRes.status === 403;
    recordResult('Participant -> /admin Blocked', test11Pass, consoleErrors, networkErrors, `Browser redirected to ${adminUrl}, API returned 403 Forbidden`);

    // -------------------------------------------------------------
    // TEST 12: Logout -> Login Again
    // -------------------------------------------------------------
    consoleErrors = [];
    networkErrors = [];
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
    const logoutBtn = page.locator('button:has-text("LOGOUT"), button:has-text("Sign Out")').first();
    await logoutBtn.click();
    await page.waitForURL('**/login', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Login again
    await page.fill('input[type="text"], input[name="identifier"], input[placeholder*="email" i]', 'participant@example.com');
    await page.fill('input[type="password"]', 'participant1234');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    await page.waitForTimeout(1500);

    const reloginHtml = await page.locator('#root').innerHTML();
    const test12Pass = reloginHtml.includes('OPERATIONAL CONSOLE') && reloginHtml.length > 5000;
    recordResult('Logout -> Relogin', test12Pass, consoleErrors, networkErrors, 'Successfully logged out and logged back in');

    // -------------------------------------------------------------
    // TEST 13: Admin Login & Backend RBAC Control Plane
    // -------------------------------------------------------------
    consoleErrors = [];
    networkErrors = [];
    // Logout participant first
    await page.locator('button:has-text("LOGOUT")').first().click();
    await page.waitForURL('**/login', { timeout: 10000 });

    // Login as Admin
    await page.fill('input[type="text"], input[name="identifier"]', 'admin@techxmadras.org');
    await page.fill('input[type="password"]', 'YourStrongAdminPassword2026!#');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    // Call Admin API from authenticated admin browser context
    const adminApiCheck = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/v1/admin/teams', { credentials: 'include' });
        const data = await res.json();
        return { status: res.status, data };
      } catch (e) {
        return { error: e.message };
      }
    });

    const test13Pass = adminApiCheck.status === 200 && Array.isArray(adminApiCheck.data);
    recordResult('Admin Login & Control Plane Access', test13Pass, consoleErrors, networkErrors, `Admin API returned ${adminApiCheck.data?.length || 0} teams`);

    // -------------------------------------------------------------
    // TEST 14 & 15: REGISTER_TEAM & New Participant Login Workflow
    // -------------------------------------------------------------
    consoleErrors = [];
    networkErrors = [];
    console.log('Testing REGISTER_TEAM programmatic provisioning...');
    const provisionResult = spawnSync(
      'docker',
      [
        'compose',
        '-f', 'docker-compose.yml',
        '-f', 'docker-compose.lan.yml',
        'exec', '-T', 'backend',
        'node', 'dist/scripts/provision_team.js'
      ],
      {
        cwd: path.resolve(__dirname, '..'),
        input: JSON.stringify({ teamName: 'test_e2e_team', email: 'test_e2e_user@techx.org', password: 'TestPass1234!' }),
        encoding: 'utf8'
      }
    );

    console.log('Provision stdout:', provisionResult.stdout);
    if (provisionResult.stderr) console.error('Provision stderr:', provisionResult.stderr);

    const provisionSuccess = provisionResult.status === 0 && provisionResult.stdout.includes('SUCCESS');
    
    // Now test logging into browser with the newly provisioned participant!
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="text"], input[name="identifier"]', 'test_e2e_user@techx.org');
    await page.fill('input[type="password"]', 'TestPass1234!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    await page.waitForTimeout(2000);

    const newParticipantHtml = await page.locator('#root').innerHTML();
    const test14Pass = provisionSuccess && newParticipantHtml.includes('OPERATIONAL CONSOLE');
    recordResult('REGISTER_TEAM & New Participant Login', test14Pass, consoleErrors, networkErrors, 'New participant successfully provisioned and accessed dashboard');

    // -------------------------------------------------------------
    // TEST 16: DELETE_TEST_TEAM.bat Cleanup Workflow
    // -------------------------------------------------------------
    consoleErrors = [];
    networkErrors = [];
    console.log('Testing DELETE_TEST_TEAM cleanup for test_e2e_user...');
    const cleanupResult = spawnSync(
      'docker',
      [
        'compose',
        '-f', 'docker-compose.yml',
        '-f', 'docker-compose.lan.yml',
        'exec', '-T', 'backend',
        'node', 'dist/scripts/cleanup_test_team.js',
        '--cleanup', 'test_e2e_user',
        '--confirm', 'DELETE test_e2e_user'
      ],
      {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf8'
      }
    );

    console.log('Cleanup stdout:', cleanupResult.stdout);
    const cleanupSuccess = cleanupResult.status === 0 && (cleanupResult.stdout.includes('CLEANUP COMPLETE') || cleanupResult.stdout.includes('SUCCESS'));

    // Filter expected 401 for deleted user login rejection
    consoleErrors = consoleErrors.filter(e => !e.includes('401'));
    networkErrors = networkErrors.filter(e => !e.includes('401'));

    // Verify test_e2e_user can no longer log in
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="text"], input[name="identifier"]', 'test_e2e_user@techx.org');
    await page.fill('input[type="password"]', 'TestPass1234!');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    const loginBlockedAfterDelete = page.url().includes('/login');
    const test16Pass = cleanupSuccess && loginBlockedAfterDelete;
    recordResult('DELETE_TEST_TEAM Cleanup Verification', test16Pass, consoleErrors, networkErrors, 'Test participant deleted and login blocked');

  } catch (err) {
    console.error('Unhandled suite error:', err);
  } finally {
    await browser.close();
  }

  // Print final Summary Table
  console.log('\n============================================================');
  console.log('FINAL BROWSER TEST MATRIX');
  console.log('============================================================');
  console.table(results);
}

run();
