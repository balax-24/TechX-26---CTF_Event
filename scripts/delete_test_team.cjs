#!/usr/bin/env node
/**
 * TechX CTF 2026 — Interactive Test Team & Participant Cleanup CLI
 * Invoked by DELETE_TEST_TEAM.bat on the host.
 * Resolves participant username -> team -> displays non-sensitive details,
 * requires explicit 'DELETE <username>' confirmation, then delegates
 * atomic transactional cleanup to AdminService inside Docker.
 */

const { spawn, execSync } = require('child_process');
const readline = require('readline');
const path = require('path');

let nonTtyRl = null;

function promptText(query) {
  if (process.stdin.isTTY) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(query, (ans) => {
        rl.close();
        resolve(ans.trim());
      });
    });
  } else {
    if (!nonTtyRl) {
      nonTtyRl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
    }
    return new Promise((resolve) => {
      process.stdout.write(query);
      nonTtyRl.once('line', (line) => {
        resolve(line.trim());
      });
    });
  }
}

function runDockerBackendCommand(args) {
  const repoRoot = path.resolve(__dirname, '..');
  const composeBase = path.join(repoRoot, 'docker-compose.yml');
  const composeLan = path.join(repoRoot, 'docker-compose.lan.yml');

  return new Promise((resolve, reject) => {
    const child = spawn(
      'docker',
      [
        'compose',
        '-f',
        composeBase,
        '-f',
        composeLan,
        'exec',
        '-T',
        'backend',
        'node',
        'dist/scripts/cleanup_test_team.js',
        ...args,
      ],
      {
        cwd: repoRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    let stdoutData = '';
    let stderrData = '';

    child.stdout.on('data', (c) => (stdoutData += c));
    child.stderr.on('data', (c) => (stderrData += c));

    child.on('close', (code) => {
      resolve({ code, stdout: stdoutData.trim(), stderr: stderrData.trim() });
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

async function main() {
  console.log('============================================================');
  console.log(' TECHX CTF 2026');
  console.log(' TEST TEAM CLEANUP');
  console.log('============================================================');
  console.log('');

  // 1. Prompt for test participant username
  console.log('Enter test participant username:');
  const username = await promptText('> ');
  if (!username) {
    console.error('\nERROR:\nUSER_NOT_FOUND: Participant username is required.');
    process.exit(1);
  }

  // 2. Perform backend lookup
  const lookupRes = await runDockerBackendCommand(['--lookup', username, '--json']);
  if (lookupRes.code !== 0) {
    console.log('');
    if (lookupRes.stderr.includes('USER_NOT_FOUND')) {
      console.error('ERROR:\nUSER_NOT_FOUND: Participant does not exist.');
    } else if (lookupRes.stderr.includes('USER_HAS_NO_TEAM')) {
      console.error('ERROR:\nUSER_HAS_NO_TEAM: Participant is not assigned to any team.');
    } else if (lookupRes.stderr.includes('NOT_A_TEST_ACCOUNT') || lookupRes.stderr.includes('not marked as a test account')) {
      console.error('REFUSED:\nThis participant is not marked as a test account.\nNo changes made.');
    } else {
      console.error(lookupRes.stderr || lookupRes.stdout || 'ERROR:\nFailed to lookup participant.');
    }
    process.exit(1);
  }

  let lookup;
  try {
    const lines = lookupRes.stdout.split('\n');
    const jsonLine = lines.find((l) => l.trim().startsWith('{') && l.trim().endsWith('}'));
    const parsed = JSON.parse(jsonLine || lookupRes.stdout);
    lookup = parsed.lookup;
  } catch (err) {
    console.error('ERROR:\nFailed to parse lookup response from backend.');
    process.exit(1);
  }

  // 3. Display non-sensitive confirmation details
  console.log('');
  console.log('Participant found.');
  console.log('');
  console.log('Username:');
  console.log(lookup.username);
  console.log('');
  console.log('Team:');
  console.log(lookup.teamName);
  console.log('');
  console.log('Score:');
  console.log(lookup.score);
  console.log('');
  console.log('Solves:');
  console.log(lookup.solves);
  console.log('');
  console.log('============================================================');
  console.log('WARNING');
  console.log('============================================================');
  console.log('');
  console.log('This operation is ONLY for removing a TEST TEAM.');
  console.log('');
  console.log('Type exactly:');
  console.log('');
  console.log(`DELETE ${lookup.username}`);
  console.log('');

  // 4. Prompt for confirmation
  const confirmation = await promptText('> ');
  const expectedConfirmation = `DELETE ${lookup.username}`;

  if (confirmation !== expectedConfirmation) {
    console.log('');
    console.log('CANCELLED.');
    console.log('No changes were made.');
    process.exit(0);
  }

  // 5. Execute atomic cleanup via backend
  const cleanupRes = await runDockerBackendCommand([
    '--cleanup',
    lookup.username,
    '--confirm',
    confirmation,
    '--json',
  ]);

  if (cleanupRes.code !== 0) {
    console.log('');
    if (cleanupRes.stderr.includes('CANCELLED')) {
      console.log('CANCELLED.');
      console.log('No changes were made.');
    } else if (cleanupRes.stderr.includes('NOT_A_TEST_ACCOUNT')) {
      console.error('REFUSED:\nThis participant is not marked as a test account.\nNo changes made.');
    } else {
      console.error(cleanupRes.stderr || cleanupRes.stdout || 'ERROR:\nCLEANUP_FAILED');
    }
    process.exit(1);
  }

  // 6. Display success output
  console.log('');
  console.log('============================================================');
  console.log(' TEST TEAM CLEANUP COMPLETE');
  console.log('============================================================');
  console.log('');
  console.log('Participant:');
  console.log(lookup.username);
  console.log('');
  console.log('Team:');
  console.log(lookup.teamName);
  console.log('');
  console.log('Leaderboard:');
  console.log('REMOVED');
  console.log('');
  console.log('Redis:');
  console.log('VERIFIED');
  console.log('');
  console.log('Dynamic Challenge Resources:');
  console.log('CLEANED');
  console.log('');
  console.log('Database:');
  console.log('CLEANUP COMMITTED');
  console.log('');
  console.log('Audit:');
  console.log('RECORDED');
  console.log('');
  console.log('============================================================');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nERROR:\n', err.message);
  process.exit(1);
});
