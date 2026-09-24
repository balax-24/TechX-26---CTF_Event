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
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 300,
  maxFreeSockets: 50,
  timeout: 5000,
});

async function singleReq(pathStr: string, token?: string, method = 'GET', body?: any) {
  return new Promise<{ statusCode: number; ms: number }>((resolve) => {
    const start = performance.now();
    const url = new URL(pathStr, TARGET_HOST);
    const headers: Record<string, string> = { Accept: 'application/json' };
    let bodyStr = '';
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      bodyStr = JSON.stringify(body);
    }
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname + url.search,
        method,
        headers,
        agent: httpAgent,
        timeout: 4000,
      },
      (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve({ statusCode: res.statusCode || 0, ms: performance.now() - start }));
      }
    );
    req.on('error', () => resolve({ statusCode: 0, ms: performance.now() - start }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ statusCode: 504, ms: performance.now() - start });
    });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

export async function runAcceleratedSoakDrill() {
  console.log('======================================================================');
  console.log('     PHASE 19 — TWO-DAY ACCELERATED EVENT SOAK SIMULATION             ');
  console.log('======================================================================');

  const usersPath = path.resolve(__dirname, 'simulation_users.json');
  const allUsers: ParticipantCredential[] = JSON.parse(fs.readFileSync(usersPath, 'utf8'));

  console.log(`[+] Initializing soak model across 7 lifecycle stages...`);
  const initialMem = execSync('docker stats --no-stream --format "{{.Name}}: {{.MemUsage}}"').toString().trim();
  console.log(`[19.0] Pre-Soak Container Memory:\n${initialMem}`);

  // Stage 1: Registration & Opening Rush
  console.log('\n[19.1] Stage 1: Opening Catalog Browsing Burst (200 requests)...');
  const s1Tasks = allUsers.slice(0, 100).flatMap((u) => [
    singleReq('/api/v1/challenges', u.token),
    singleReq('/api/v1/teams/me', u.token),
  ]);
  const s1Res = await Promise.all(s1Tasks);
  const s1Ok = s1Res.filter((r) => r.statusCode === 200).length;
  console.log(`    Stage 1: ${s1Ok}/${s1Res.length} OK`);

  // Stage 2: Early Peak Rush (Flags & Details)
  console.log('\n[19.2] Stage 2: Early Peak Challenge Inspection & Submissions (200 requests)...');
  const s2Tasks = allUsers.slice(100, 200).flatMap((u, idx) => [
    singleReq('/api/v1/challenges/web-intro-portal', u.token),
    singleReq('/api/v1/submissions/flag', u.token, 'POST', {
      challengeSlug: 'web-intro-portal',
      flag: `techx{soak_attempt_${idx}}`,
    }),
  ]);
  const s2Res = await Promise.all(s2Tasks);
  const s2Ok = s2Res.filter((r) => r.statusCode === 200).length;
  console.log(`    Stage 2: ${s2Ok}/${s2Res.length} 200 OK`);

  // Stage 3: Live Scoreboard Burst & Continuous Queries
  console.log('\n[19.3] Stage 3: Scoreboard Burst (150 concurrent leaderboard fetches)...');
  const s3Tasks = Array.from({ length: 150 }).map((_, i) =>
    singleReq('/api/v1/leaderboard', allUsers[i % 50].token)
  );
  const s3Res = await Promise.all(s3Tasks);
  const s3Ok = s3Res.filter((r) => r.statusCode === 200).length;
  console.log(`    Stage 3: ${s3Ok}/${s3Res.length} OK`);

  // Stage 4: Dynamic Challenge Creation & Cleanup
  console.log('\n[19.4] Stage 4: Dynamic Sandbox Lifecycle (Team 50 starts & stops instance)...');
  const team50 = allUsers[196]; // Team 50 captain
  const startInst = await singleReq('/api/v1/challenges/intro-sqli-sandbox/instance', team50.token, 'POST');
  console.log(`    Instance start: ${startInst.statusCode}`);
  await new Promise((r) => setTimeout(r, 500));
  const stopInst = await singleReq('/api/v1/challenges/intro-sqli-sandbox/instance/stop', team50.token, 'POST');
  console.log(`    Instance stop: ${stopInst.statusCode}`);

  // Stage 5: Late Event Activity
  console.log('\n[19.5] Stage 5: Final Competition Rush (200 requests)...');
  const s5Tasks = allUsers.slice(200, 300).flatMap((u) => [
    singleReq('/api/v1/challenges/web-sqli-checkpoint', u.token),
    singleReq('/api/v1/leaderboard', u.token),
  ]);
  const s5Res = await Promise.all(s5Tasks);
  const s5Ok = s5Res.filter((r) => r.statusCode === 200).length;
  console.log(`    Stage 5: ${s5Ok}/${s5Res.length} OK`);

  // Post-Soak Verification
  console.log('\n[19.6] Post-Soak Container Memory Inspection:');
  const finalMem = execSync('docker stats --no-stream --format "{{.Name}}: {{.MemUsage}}"').toString().trim();
  console.log(finalMem);

  const finalHealth = await singleReq('/api/v1/health');
  console.log(`\n[19.7] Final Healthcheck: status=${finalHealth.statusCode}, latency=${finalHealth.ms.toFixed(2)}ms`);
  if (finalHealth.statusCode !== 200) throw new Error('Health check failed after accelerated soak');

  console.log('\n======================================================================');
  console.log('       ✓ PHASE 19 ACCELERATED SOAK COMPLETED SUCCESSFULLY             ');
  console.log('======================================================================');
}

if (process.argv[1]?.includes('accelerated_soak_drill')) {
  runAcceleratedSoakDrill()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[-] Soak test failed:', err);
      process.exit(1);
    });
}
