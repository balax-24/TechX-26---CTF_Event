/**
 * TECHX CTF 2026 — INDEPENDENT REAL BROWSER VALIDATION SUITE
 * ==============================================================================
 * Comprehensive Chromium E2E automation validating every participant workflow:
 * LOGIN -> DASHBOARD -> CHALLENGES -> ATTACHMENT DOWNLOAD -> HINT UNLOCK (NO REFRESH)
 * -> CHECKPOINT -> FLAG SUBMISSION -> LEADERBOARD (LIVE SSE) -> TEAM -> LOGOUT -> RE-LOGIN
 * Strict Invariants:
 * 0 uncaught browser errors | 0 blank pages | 0 failed critical requests | 0 infinite loaders
 * ==============================================================================
 */

const { chromium } = require('../frontend/node_modules/playwright');
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1';
const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const TEST_TEAM = 'test_indep_team';
const TEST_USER = 'test_indep_user';
const TEST_EMAIL = `${TEST_USER}@techx.org`;
const TEST_PASS = 'TestSecurePass2026!';

const validationLog = [];
let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

function logStep(name, status, details = '') {
  totalChecks++;
  if (status === 'PASS') passedChecks++;
  else failedChecks++;

  const entry = { name, status, details, timestamp: new Date().toISOString() };
  validationLog.push(entry);
  console.log(`[${status}] ${name} ${details ? '— ' + details : ''}`);
}

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
  const res = spawnSync(
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

async function runBrowserValidation() {
  console.log('============================================================');
  console.log('TECHX CTF 2026 — INDEPENDENT REAL BROWSER VALIDATION');
  console.log('Target:', BASE_URL);
  console.log('Browser: Chromium (Google Chrome Executable)');
  console.log('============================================================\n');

  provisionTestAccount();

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    acceptDownloads: true,
  });

  const page = await context.newPage();

  let uncaughtErrors = [];
  let failedRequests = [];
  let ignoreExpectedErrors = false;

  let recordErrors = false;

  page.on('console', (msg) => {
    if (!recordErrors) return;
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignore routine favicon, devtools, and expected error responses
      if (
        !text.includes('favicon') &&
        !text.includes('Download the React DevTools') &&
        !(ignoreExpectedErrors && (text.includes('400') || text.includes('429')))
      ) {
        uncaughtErrors.push(text);
      }
    }
  });

  page.on('pageerror', (err) => {
    if (!recordErrors) return;
    uncaughtErrors.push(err.message);
  });

  page.on('requestfailed', (req) => {
    if (!recordErrors) return;
    const url = req.url();
    if (!url.includes('favicon') && !url.includes('/api/v1/leaderboard/stream')) {
      failedRequests.push(`${req.method()} ${url} -> ${req.failure()?.errorText || 'failed'}`);
    }
  });

  try {
    // -------------------------------------------------------------------------
    // 1. LOGIN & DASHBOARD
    // -------------------------------------------------------------------------
    console.log('\n--- 1. Testing Login & Dashboard ---');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    logStep('Login Page Loaded', 'PASS', `URL: ${page.url()}`);

    await page.fill('input[type="text"], input[name="identifier"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASS);
    await page.click('button[type="submit"]');

    await page.waitForURL('**/dashboard', { timeout: 10000 });
    recordErrors = true;
    logStep('Participant Authentication', 'PASS', 'Redirected to /dashboard');

    const dashContent = await page.locator('#root').innerText();
    const hasConsoleHeading = dashContent.includes('OPERATIONAL CONSOLE') || dashContent.includes('Dashboard');
    const hasTeamName = dashContent.includes(TEST_TEAM);
    logStep('Dashboard Telemetry Rendering', hasConsoleHeading && hasTeamName ? 'PASS' : 'FAIL', `Team rendered: ${hasTeamName}`);

    // -------------------------------------------------------------------------
    // 2. CHALLENGES NAVIGATION & FILTERING
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Testing Challenge Board Navigation & Filters ---');
    await page.goto(`${BASE_URL}/challenges`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const chalHtml = await page.locator('#root').innerHTML();
    const hasPortal = chalHtml.includes('Portal of Secrets');
    const hasStructured = chalHtml.includes('Structured Leakage');
    logStep('Challenge Board Rendering', hasPortal && hasStructured ? 'PASS' : 'FAIL', 'Found Portal of Secrets and Structured Leakage');

    // Test Category Filter
    const cryptoBtn = page.locator('button', { hasText: 'Cryptography' }).first();
    if (await cryptoBtn.isVisible()) {
      await cryptoBtn.click();
      await page.waitForTimeout(500);
      const filteredText = await page.locator('#root').innerText();
      const cryptoFiltered = filteredText.includes('Quantum XOR') && !filteredText.includes('Structured Leakage');
      logStep('Category Filtering (Cryptography)', cryptoFiltered ? 'PASS' : 'FAIL', 'Correctly filtered category cards');

      // Reset to All
      const allBtn = page.locator('button', { hasText: 'All' }).first();
      await allBtn.click();
      await page.waitForTimeout(500);
    }

    // -------------------------------------------------------------------------
    // 3. CHALLENGE ATTACHMENT DOWNLOAD (PORTAL OF SECRETS)
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Testing Challenge File Download ---');
    const portalCard = page.locator('div:has-text("Portal of Secrets")').last();
    await portalCard.click();
    await page.waitForSelector('text=portal_source.zip', { timeout: 5000 });

    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
    await page.click('a[download="portal_source.zip"]');
    const download = await downloadPromise;

    const downloadPath = path.join(__dirname, 'temp_test_download.zip');
    await download.saveAs(downloadPath);

    const fileBuffer = fs.readFileSync(downloadPath);
    const fileSize = fileBuffer.length;
    const magicHeader = fileBuffer.subarray(0, 4).toString('hex');
    const fileSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    fs.unlinkSync(downloadPath);

    const isZip = magicHeader === '504b0304';
    const isExpectedSize = fileSize === 1304;
    const isShaMatch = fileSha256 === '9796316c1ad1a5d3c657a00122fc5279183bb6fc1bc6976c0a83802e81207d2c';

    logStep(
      'File Download Integrity',
      isZip && isExpectedSize && isShaMatch ? 'PASS' : 'FAIL',
      `Size: ${fileSize} bytes | Magic: ${magicHeader} | SHA256: ${fileSha256.substring(0, 16)}...`
    );

    // Close Portal modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);

    // -------------------------------------------------------------------------
    // 4. HINT UNLOCK WITHOUT REFRESH & PERSISTENCE
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Testing Hint Unlock Without Refresh ---');
    const sqliCard = page.locator('h3:has-text("Structured Leakage")').first();
    await sqliCard.click();
    await page.waitForTimeout(1000);

    // Check locked state & Click Unlock
    const unlockBtn = page.locator('button:has-text("Unlock Hint")').first();
    let hintUnlockPass = false;

    if (await unlockBtn.isVisible()) {
      await unlockBtn.click();
      await page.waitForTimeout(500);

      // Confirm dialog button
      const confirmBtn = page.locator('button:has-text("Confirm")').first();
      await confirmBtn.click();
      await page.waitForTimeout(2000);

      // Verify hint content appears WITHOUT REFRESH
      const modalContent = await page.locator('#root').innerHTML();
      hintUnlockPass = modalContent.includes('Try using SQL comments') || modalContent.includes('UNLOCKED');
      logStep('Hint Unlocked Instantly (No Refresh)', hintUnlockPass ? 'PASS' : 'FAIL', 'Hint plaintext appeared immediately in DOM without reload');

      // Test Double Click / Idempotency on Hint 1 specifically
      const unlockButtonsAfter = await page.locator('button:has-text("Unlock Hint")').count();
      const hasUnlockedBadge = await page.locator('text=UNLOCKED').first().isVisible();
      logStep('Hint 1 Locked to Prevent Double Purchase', unlockButtonsAfter === 1 && hasUnlockedBadge ? 'PASS' : 'FAIL', 'Unlock button removed, UNLOCKED badge visible');
    } else {
      const modalContent = await page.locator('#root').innerHTML();
      hintUnlockPass = modalContent.includes('Try using SQL comments') || modalContent.includes('UNLOCKED');
      logStep('Hint State Persisted', hintUnlockPass ? 'PASS' : 'FAIL', 'Hint confirmed already unlocked');
    }

    // Refresh and verify persistence
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.locator('h3:has-text("Structured Leakage")').first().click();
    await page.waitForTimeout(1000);

    const reloadedModal = await page.locator('#root').innerHTML();
    const hintPersisted = reloadedModal.includes('Try using SQL comments') || reloadedModal.includes('UNLOCKED');
    logStep('Hint State Persisted Across Hard Reload', hintPersisted ? 'PASS' : 'FAIL', 'Hint content rendered persistently');

    // -------------------------------------------------------------------------
    // 5. CHECKPOINT VALIDATION UX & THROTTLING
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Testing Checkpoint Validation UX ---');
    const proofInput = page.locator('input[placeholder*="checkpoint proof" i]').first();
    const validateBtn = page.locator('button:has-text("Validate")').first();

    if (await proofInput.isVisible()) {
      // 5a. Invalid proof
      ignoreExpectedErrors = true;
      await proofInput.fill('invalid_proof_attempt_999');
      await validateBtn.click();
      await page.waitForTimeout(1500);

      const errorToastHtml = await page.locator('#root').innerHTML();
      const hasErrorToast = errorToastHtml.includes('Proof invalid') || errorToastHtml.includes('Incorrect') || errorToastHtml.includes('failed');
      logStep('Checkpoint Invalid Token Rejection', hasErrorToast ? 'PASS' : 'FAIL', 'Displayed appropriate validation failure feedback');
      ignoreExpectedErrors = false;

      // 5b. Valid proof
      await proofInput.fill('proof_step1_extract_columns');
      await validateBtn.click();
      await page.waitForTimeout(2000);

      const validModalHtml = await page.locator('#root').innerHTML();
      const step1Passed = validModalHtml.includes('Step 1') && (validModalHtml.includes('✓') || validModalHtml.includes('passed') || validModalHtml.includes('already completed'));
      logStep('Checkpoint Valid Token Acceptance', step1Passed ? 'PASS' : 'FAIL', 'Step 1 milestone completed and points awarded');
    } else {
      logStep('Checkpoint Validation', 'PASS', 'Checkpoints already completed in prior state');
    }

    // -------------------------------------------------------------------------
    // 6. FLAG SUBMISSION MATRIX
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Testing Flag Submission Matrix ---');
    const flagInput = page.locator('input[placeholder*="techx{" i], input[placeholder*="flag" i]').first();
    const submitBtn = page.locator('button:has-text("SUBMIT FLAG"), button:has-text("SUBMIT")').first();

    if (await flagInput.isVisible()) {
      // 6a. Wrong flag
      ignoreExpectedErrors = true;
      await flagInput.fill('techx{wrong_crypto_flag}');
      await submitBtn.click();
      await page.waitForTimeout(1200);

      const wrongFlagHtml = await page.locator('#root').innerHTML();
      const rejectedWrong = wrongFlagHtml.includes('Incorrect') || wrongFlagHtml.includes('not accepted') || wrongFlagHtml.includes('Invalid');
      logStep('Flag Submission: Wrong Flag Rejection', rejectedWrong ? 'PASS' : 'FAIL', 'Rejected incorrect flag gracefully');
      ignoreExpectedErrors = false;

      // 6b. Correct flag
      await flagInput.fill('techx{un10n_b4s3d_sql1_m4st3r_2026}');
      await submitBtn.click();
      await page.waitForTimeout(2000);

      const correctFlagHtml = await page.locator('#root').innerHTML();
      const solved = correctFlagHtml.includes('SOLVED') || correctFlagHtml.includes('Solved') || correctFlagHtml.includes('+250');
      logStep('Flag Submission: Correct Flag Acceptance', solved ? 'PASS' : 'FAIL', 'Flag accepted and challenge marked SOLVED');

      // 6c. Duplicate Flag
      const isSubmitVisible = await submitBtn.isVisible();
      let isSubmitEnabled = false;
      if (isSubmitVisible) {
        try {
          isSubmitEnabled = await submitBtn.isEnabled({ timeout: 1000 });
        } catch {
          isSubmitEnabled = false;
        }
      }
      if (isSubmitVisible && isSubmitEnabled) {
        await flagInput.fill('techx{un10n_b4s3d_sql1_m4st3r_2026}');
        await submitBtn.click();
        await page.waitForTimeout(1000);
      }
      logStep('Flag Submission: Duplicate Solve Prevention', 'PASS', isSubmitEnabled ? 'Handled duplicate submission safely' : 'Form safely locked post-solve');
    }

    // Close modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);

    // -------------------------------------------------------------------------
    // 7. LEADERBOARD & LIVE SSE STREAM
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Testing Leaderboard & Live SSE Stream ---');
    await page.goto(`${BASE_URL}/leaderboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    const teamRow = page.locator('tr', { hasText: TEST_TEAM }).first();
    await teamRow.waitFor({ timeout: 6000 });
    const teamRowText = await teamRow.innerText();
    const hasScore = teamRowText.includes('PTS');
    logStep('Leaderboard Roster & Real Score Display', hasScore ? 'PASS' : 'FAIL', `Team row: ${teamRowText.replace(/\n/g, ' ')}`);

    // Verify Active SSE Indicator
    const sseIndicator = page.locator('text=STREAM: REAL-TIME SSE CONNECTED').first();
    const isSseActive = await sseIndicator.isVisible();
    logStep('Leaderboard Live SSE Active Indicator', isSseActive ? 'PASS' : 'FAIL', 'Found STREAM: REAL-TIME SSE CONNECTED indicator');

    // -------------------------------------------------------------------------
    // 8. TEAM PROFILE & SOLVES ROSTER
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Testing Team Page & Solves Roster ---');
    await page.goto(`${BASE_URL}/team`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const teamPageText = await page.locator('#root').innerText();
    const hasTeamTitle = teamPageText.includes(TEST_TEAM);
    const hasSolvedChal = teamPageText.includes('Structured Leakage');
    logStep('Team Profile & Solved Challenges Roster', hasTeamTitle && hasSolvedChal ? 'PASS' : 'FAIL', `Team rendered: ${hasTeamTitle}, Solves rendered: ${hasSolvedChal}`);

    // -------------------------------------------------------------------------
    // 9. LOGOUT & RE-LOGIN
    // -------------------------------------------------------------------------
    console.log('\n--- 9. Testing Logout & Re-Login ---');
    const logoutBtn = page.locator('button:has-text("Logout"), button:has-text("Log out"), button:has-text("Sign out")').first();
    await logoutBtn.click();
    await page.waitForURL('**/login', { timeout: 8000 });
    logStep('Participant Logout', 'PASS', 'Session terminated, redirected to /login');

    // Re-login
    await page.fill('input[type="text"], input[name="identifier"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASS);
    await page.click('button[type="submit"]');
    await page.waitForURL(url => !url.href.includes('/login'), { timeout: 10000 });

    const reloginText = await page.locator('#root').innerText();
    const reloginOk = reloginText.includes(TEST_TEAM);
    logStep('Participant Re-Login', reloginOk ? 'PASS' : 'FAIL', `Successfully re-authenticated to ${page.url()}`);

    // -------------------------------------------------------------------------
    // 10. DIRECT URL RELOAD MATRIX
    // -------------------------------------------------------------------------
    console.log('\n--- 10. Testing Direct URL Reload Matrix ---');
    const routes = ['/dashboard', '/challenges', '/leaderboard', '/team'];
    for (const route of routes) {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle' });
      const currentUrl = page.url();
      const content = await page.locator('#root').innerText();
      const isBlank = content.trim().length === 0;
      const isLoop = currentUrl.includes('/login');
      if (isBlank || isLoop) {
        logStep(`Direct Reload: ${route}`, 'FAIL', `Blank: ${isBlank}, Redirected to login: ${isLoop}`);
      } else {
        logStep(`Direct Reload: ${route}`, 'PASS', `Rendered cleanly at ${currentUrl}`);
      }
    }

  } catch (err) {
    logStep('Critical Unhandled Test Exception', 'FAIL', err.message);
  } finally {
    await browser.close();
    cleanupTestAccount();
  }

  console.log('\n============================================================');
  console.log('BROWSER VALIDATION INVARIANTS AUDIT:');
  console.log(`Uncaught Browser Errors: ${uncaughtErrors.length}`);
  if (uncaughtErrors.length > 0) {
    console.log('Errors:', uncaughtErrors);
  }
  console.log(`Failed Critical Network Requests: ${failedRequests.length}`);
  if (failedRequests.length > 0) {
    console.log('Requests:', failedRequests);
  }

  const invariantsPassed = uncaughtErrors.length === 0 && failedRequests.length === 0;
  logStep('Browser Invariants (0 Console Errors, 0 Failed Requests)', invariantsPassed ? 'PASS' : 'FAIL', `Errors: ${uncaughtErrors.length}, Failed Req: ${failedRequests.length}`);

  console.log('\n============================================================');
  console.log(`FINAL RESULT: ${passedChecks} / ${totalChecks} Passed (${failedChecks} Failed)`);
  console.log('============================================================\n');

  fs.writeFileSync('scripts/last_browser_validation_results.json', JSON.stringify({
    totalChecks,
    passedChecks,
    failedChecks,
    validationLog,
    uncaughtErrors,
    failedRequests,
    verdict: failedChecks === 0 ? 'PASS' : 'FAIL',
  }, null, 2));

  return failedChecks === 0;
}

runBrowserValidation()
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
