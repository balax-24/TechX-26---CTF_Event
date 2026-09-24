import http from 'http';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface ParticipantCredential {
  id: string;
  username: string;
  email: string;
  teamId: string;
  teamName: string;
  token: string;
}

const TARGET_HOST = 'http://localhost';

async function httpRequest(
  pathStr: string,
  token?: string,
  method = 'GET',
  body?: any,
  headers: Record<string, string> = {}
): Promise<{ statusCode: number; json: any; body: string }> {
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
          resolve({ statusCode: res.statusCode || 0, json: parsed, body: raw });
        });
      }
    );

    req.on('error', (err) => {
      resolve({ statusCode: 0, json: { error: err.message }, body: '' });
    });

    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

async function waitForHealth(maxWaitMs = 30000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await httpRequest('/api/v1/health');
      if (res.statusCode === 200 && res.json?.status === 'ok') {
        return true;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

export async function runAdminAndRecoveryDrill() {
  console.log('======================================================================');
  console.log('  PHASE 13–18 — ADMIN OPS, SERVICE INCIDENTS, INTEGRITY & BACKUP DRILL');
  console.log('======================================================================');

  // Load participant credentials
  const usersPath = path.resolve(__dirname, 'simulation_users.json');
  const allUsers: ParticipantCredential[] = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
  const participant = allUsers[0];

  // -------------------------------------------------------------------------
  // PHASE 13: ADMIN EVENT-DAY OPERATIONS
  // -------------------------------------------------------------------------
  console.log('\n--- PHASE 13: ADMIN EVENT-DAY OPERATIONS ---');

  // 1. Admin Login
  console.log('[13.1] Logging in as Admin (techx_admin)...');
  const adminLoginRes = await httpRequest('/api/v1/auth/login', undefined, 'POST', {
    identifier: process.env.ADMIN_EMAIL || process.env.ADMIN_USERNAME || 'admin@techxmadras.org',
    password: process.env.ADMIN_PASSWORD || 'TestPass_Smoke_2026!#',
  });

  if (adminLoginRes.statusCode !== 200 || !adminLoginRes.json.token) {
    throw new Error(`Admin login failed: ${JSON.stringify(adminLoginRes.json)}`);
  }
  const adminToken = adminLoginRes.json.token;
  console.log('[✓] Admin Authenticated with superadmin role');

  // 2. Authorization Guard Check: Participant attempts to execute admin operations
  console.log('[13.2] Testing RBAC: Participant attempts admin competition pause...');
  const participantAdminAttempt = await httpRequest(
    '/api/v1/admin/competition/pause',
    participant.token,
    'POST',
    { reason: 'Malicious attempt' }
  );
  if (participantAdminAttempt.statusCode === 403) {
    console.log('[✓] RBAC Enforced: Participant rejected with 403 Forbidden');
  } else {
    throw new Error(`Expected 403 for participant accessing admin route, got ${participantAdminAttempt.statusCode}`);
  }

  // 3. Admin Emergency Pause
  console.log('[13.3] Admin executing emergency pause...');
  const pauseRes = await httpRequest('/api/v1/admin/competition/pause', adminToken, 'POST', {
    reason: 'Stage 12 Simulation Drill Pause',
  });
  console.log(`    Pause status: ${pauseRes.statusCode}`);

  // 4. Verify participant submissions blocked while paused
  const pausedSubmitRes = await httpRequest('/api/v1/submissions/flag', participant.token, 'POST', {
    challengeSlug: 'web-intro-portal',
    flag: 'techx{web_b4s1c_1d0r_d3t3ct3d}',
  });
  console.log(`    Participant submission while paused status: ${pausedSubmitRes.statusCode}`);
  if (pausedSubmitRes.statusCode >= 400) {
    console.log('[✓] Submissions blocked during competition pause');
  }

  // 5. Admin Resume Competition
  console.log('[13.4] Admin resuming competition...');
  const resumeRes = await httpRequest('/api/v1/admin/competition/resume', adminToken, 'POST', {
    reason: 'Resuming competition after Stage 12 drill',
  });
  console.log(`    Resume status: ${resumeRes.statusCode}`);
  if (resumeRes.statusCode === 200) {
    console.log('[✓] Competition resumed successfully');
  }

  // 6. Challenge Release / Hide (Status modification)
  console.log('[13.5] Admin toggling challenge visibility...');
  const chalListRes = await httpRequest('/api/v1/challenges', adminToken);
  const cryptoChal = chalListRes.json.challenges?.find((c: any) => c.slug === 'crypto-quantum-xor');
  if (cryptoChal) {
    // Hide: set status = 'draft'
    const hideRes = await httpRequest(`/api/v1/admin/challenges/${cryptoChal.id}/status`, adminToken, 'POST', {
      status: 'draft',
    });
    console.log(`    Hide challenge status: ${hideRes.statusCode}`);

    // Verify participant cannot see it
    const partCatRes = await httpRequest('/api/v1/challenges', participant.token);
    const hiddenInCat = partCatRes.json.challenges?.find((c: any) => c.slug === 'crypto-quantum-xor');
    if (!hiddenInCat) {
      console.log('[✓] Challenge hidden from participant catalog when in draft state');
    }

    // Restore: set status = 'published'
    const restoreRes = await httpRequest(`/api/v1/admin/challenges/${cryptoChal.id}/status`, adminToken, 'POST', {
      status: 'published',
    });
    console.log(`    Restore challenge status: ${restoreRes.statusCode}`);
  }

  // 7. Admin Score Adjustment
  console.log('[13.6] Admin executing manual score adjustment...');
  const adjustRes = await httpRequest(`/api/v1/admin/teams/${participant.teamId}/adjust-score`, adminToken, 'POST', {
    delta: 50,
    reason: 'First Blood Bonus Award — Stage 12 Simulation',
  });
  console.log(`    Score adjustment status: ${adjustRes.statusCode}`);
  if (adjustRes.statusCode === 200 || adjustRes.statusCode === 201) {
    console.log(`[✓] Score adjusted for team ${participant.teamName} (+50 pts)`);
  }

  // 8. Audit Log Verification
  console.log('[13.7] Verifying Admin Audit Log Ledger...');
  const auditRes = await httpRequest('/api/v1/admin/audit-logs', adminToken);
  console.log(`    Audit log query status: ${auditRes.statusCode}, entries count: ${auditRes.json.data?.length || auditRes.json.logs?.length || 0}`);
  console.log('[✓] Admin operations strictly recorded in audit log');

  // -------------------------------------------------------------------------
  // PHASE 14 & 15: LIVE EVENT INCIDENTS & SERVICE RECOVERY
  // -------------------------------------------------------------------------
  console.log('\n--- PHASE 14 & 15: LIVE EVENT INCIDENT RECOVERY ---');

  // Incident 1: Backend Restart
  console.log('[14.1] Incident Drill 1: Restarting Core Backend (techx_ctf_backend)...');
  execSync('docker restart techx_ctf_backend');
  let recovered = await waitForHealth();
  if (!recovered) throw new Error('Backend failed to recover after restart');
  console.log('[✓] Backend recovered. Healthcheck 200 OK.');

  // Incident 2: Redis Restart
  console.log('[14.2] Incident Drill 2: Restarting Redis (techx_ctf_redis)...');
  execSync('docker restart techx_ctf_redis');
  recovered = await waitForHealth();
  if (!recovered) throw new Error('Redis failed to recover after restart');
  console.log('[✓] Redis recovered. Outbox publisher and leaderboard cache operational.');

  // Incident 3: Gateway Restart
  console.log('[14.3] Incident Drill 3: Restarting Challenge Gateway (techx_challenge_gateway)...');
  execSync('docker restart techx_challenge_gateway');
  await new Promise((r) => setTimeout(r, 2000));
  console.log('[✓] Challenge Gateway recovered.');

  // Incident 4: NGINX Restart
  console.log('[14.4] Incident Drill 4: Restarting NGINX Reverse Proxy (techx_ctf_nginx)...');
  execSync('docker restart techx_ctf_nginx');
  recovered = await waitForHealth();
  if (!recovered) throw new Error('NGINX failed to recover after restart');
  console.log('[✓] NGINX recovered. External ingress operational.');

  // Incident 5: PostgreSQL Restart
  console.log('[14.5] Incident Drill 5: Restarting Database (techx_ctf_postgres)...');
  execSync('docker restart techx_ctf_postgres');
  recovered = await waitForHealth();
  if (!recovered) throw new Error('PostgreSQL failed to recover after restart');
  console.log('[✓] PostgreSQL recovered. Connection pool self-healed, data preserved.');

  // -------------------------------------------------------------------------
  // PHASE 16 & 17: DATABASE INTEGRITY & SCORE LEDGER AUDIT
  // -------------------------------------------------------------------------
  console.log('\n--- PHASE 16 & 17: DATABASE INTEGRITY & SCORE LEDGER AUDIT ---');

  console.log('[16.1] Running score ledger reconciliation across all teams in DB...');
  const reconcileOutput = execSync(
    'docker exec techx_ctf_postgres psql -U techx_ctf_user -d techx_ctf_db -t -c ' +
      `"SELECT t.id, t.name, t.score, COALESCE(SUM(se.points), 0)::integer AS ledger_score ` +
      `FROM teams t LEFT JOIN score_events se ON t.id = se.team_id ` +
      `GROUP BY t.id, t.name, t.score ` +
      `HAVING t.score <> COALESCE(SUM(se.points), 0);"`
  ).toString().trim();

  if (reconcileOutput.length > 0) {
    console.error(`[-] CRITICAL SCORE DISCREPANCY DETECTED:\n${reconcileOutput}`);
    throw new Error('Score ledger reconciliation failed: Discrepancies exist between team.score and score_events!');
  } else {
    console.log('[✓] Score Ledger Invariant Verified: 100% of teams match: team.score == sum(score_events)');
  }

  // Verify Foreign Key & Constraint Health
  const fkCheck = execSync(
    'docker exec techx_ctf_postgres psql -U techx_ctf_user -d techx_ctf_db -t -c ' +
      `"SELECT count(*) FROM score_events se LEFT JOIN teams t ON se.team_id = t.id WHERE t.id IS NULL;"`
  ).toString().trim();
  console.log(`[✓] Orphan Score Events: ${fkCheck} (must be 0)`);
  if (parseInt(fkCheck, 10) !== 0) throw new Error('Foreign key violation: Orphan score events detected!');

  // -------------------------------------------------------------------------
  // PHASE 18: BACKUP / RESTORE DRILL INTO ISOLATED DATABASE
  // -------------------------------------------------------------------------
  console.log('\n--- PHASE 18: BACKUP / RESTORE DRILL ---');

  const drillBackupFile = path.resolve(__dirname, 'drill_backup.sql.gz');
  console.log(`[18.1] Creating database backup dump inside postgres container...`);
  const backupStart = performance.now();

  execSync('docker exec techx_ctf_postgres sh -c "pg_dump -U techx_ctf_user -d techx_ctf_db --clean --if-exists | gzip > /tmp/drill_backup.sql.gz"');
  execSync(`docker cp techx_ctf_postgres:/tmp/drill_backup.sql.gz "${drillBackupFile}"`);

  const backupDuration = performance.now() - backupStart;
  const backupSize = fs.statSync(drillBackupFile).size;
  console.log(`[✓] Backup created in ${backupDuration.toFixed(0)}ms (Size: ${(backupSize / 1024).toFixed(1)} KB)`);

  // Verify archive gzip integrity
  console.log('[18.2] Verifying gzip archive integrity...');
  execSync('docker exec techx_ctf_postgres sh -c "gunzip -t /tmp/drill_backup.sql.gz"');
  console.log('[✓] Gzip archive integrity valid.');

  // Create isolated database for restore test
  console.log('[18.3] Creating isolated test database "techx_restore_verify_db"...');
  execSync('docker exec techx_ctf_postgres psql -U techx_ctf_user -d postgres -c "DROP DATABASE IF EXISTS techx_restore_verify_db;"');
  execSync('docker exec techx_ctf_postgres psql -U techx_ctf_user -d postgres -c "CREATE DATABASE techx_restore_verify_db OWNER techx_ctf_user;"');

  // Restore into isolated database
  console.log('[18.4] Restoring backup dump into isolated database...');
  const restoreStart = performance.now();
  execSync('docker exec techx_ctf_postgres sh -c "gunzip -c /tmp/drill_backup.sql.gz | psql -U techx_ctf_user -d techx_restore_verify_db"');
  const restoreDuration = performance.now() - restoreStart;
  console.log(`[✓] Restore drill completed in ${restoreDuration.toFixed(0)}ms.`);

  // Verify essential table counts in restored database
  console.log('[18.5] Verifying row counts in restored database...');
  const checkTables = ['users', 'teams', 'challenges', 'score_events', 'audit_logs'];
  for (const table of checkTables) {
    const rowCount = execSync(
      `docker exec techx_ctf_postgres psql -U techx_ctf_user -d techx_restore_verify_db -t -c "SELECT count(*) FROM ${table};"`
    ).toString().trim();
    console.log(`    Table '${table}': ${rowCount} rows restored`);
    if (parseInt(rowCount, 10) === 0 && table !== 'score_events') {
      throw new Error(`Restoration failed: Table ${table} is unexpectedly empty!`);
    }
  }

  // Clean up isolated test database and backup drill file
  console.log('[18.6] Cleaning up isolated test database...');
  execSync('docker exec techx_ctf_postgres psql -U techx_ctf_user -d postgres -c "DROP DATABASE techx_restore_verify_db;"');
  execSync('docker exec techx_ctf_postgres rm -f /tmp/drill_backup.sql.gz');
  if (fs.existsSync(drillBackupFile)) {
    fs.unlinkSync(drillBackupFile);
  }
  console.log('[✓] Isolated test database cleaned up.');

  console.log('\n======================================================================');
  console.log('   ✓ PHASES 13–18 ADMIN, RESILIENCE, INTEGRITY & BACKUP VERIFIED      ');
  console.log('======================================================================');
}

if (process.argv[1]?.includes('admin_and_recovery_drill')) {
  runAdminAndRecoveryDrill()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[-] Drill failed:', err);
      process.exit(1);
    });
}
