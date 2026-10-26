#!/usr/bin/env node
/**
 * TechX CTF 2026 — Interactive Team & Participant Provisioning CLI
 * Invoked by REGISTER_TEAM.bat on the host.
 * Securely prompts for team name, participant email, and masked password,
 * then delegates directly to backend AdminService inside Docker via stdin.
 */

const { spawn, execSync } = require('child_process');
const readline = require('readline');
const path = require('path');
const fs = require('fs');

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

function promptPassword(query) {
  if (!process.stdin.isTTY) {
    return promptText(query);
  }
  return new Promise((resolve) => {
    process.stdout.write(query);
    let pass = '';

    process.stdin.setRawMode(true);
    process.stdin.resume();

    const onData = (chunk) => {
      const str = chunk.toString();
      for (const char of str) {
        if (char === '\r' || char === '\n') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', onData);
          process.stdout.write('\n');
          return resolve(pass);
        } else if (char === '\u0003') {
          // Ctrl+C
          process.stdin.setRawMode(false);
          process.stdout.write('\n');
          process.exit(1);
        } else if (char === '\u0008' || char === '\x7f') {
          // Backspace
          if (pass.length > 0) {
            pass = pass.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else if (char >= ' ') {
          pass += char;
          process.stdout.write('*');
        }
      }
    };

    process.stdin.on('data', onData);
  });
}

function detectLanIp() {
  try {
    const cmd =
      'powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -ne \'127.0.0.1\' -and $_.InterfaceAlias -notmatch \'Docker|vEthernet|WSL|Loopback\' -and $_.IPAddress -notmatch \'^169\\.254\\.\' } | Select-Object -ExpandProperty IPAddress | Select-Object -First 1"';
    const output = execSync(cmd, { encoding: 'utf8', timeout: 3000 }).trim();
    if (output) return output;
  } catch {
    // fallback
  }
  return '127.0.0.1';
}

async function main() {
  console.log('============================================================');
  console.log(' TECHX CTF 2026');
  console.log(' TEAM PROVISIONING');
  console.log('============================================================');
  console.log('');

  // 1. Collect inputs
  console.log('TEAM NAME:');
  const teamName = await promptText('> ');
  if (!teamName) {
    console.error('\nERROR:\nTeam name cannot be empty.');
    process.exit(1);
  }

  console.log('\nPARTICIPANT EMAIL:');
  const email = await promptText('> ');
  if (!email || !email.includes('@')) {
    console.error('\nERROR:\nA valid participant email address is required.');
    process.exit(1);
  }

  console.log('\nPARTICIPANT PASSWORD:');
  const password = await promptPassword('> ');
  if (!password || password.length < 8) {
    console.error('\nERROR:\nPassword must be at least 8 characters.');
    process.exit(1);
  }

  console.log('');
  console.log('Creating team...');
  console.log('Creating participant...');
  console.log('Assigning participant to team...');

  const repoRoot = path.resolve(__dirname, '..');
  const composeBase = path.join(repoRoot, 'docker-compose.yml');
  const composeLan = path.join(repoRoot, 'docker-compose.lan.yml');

  // Spawn backend provisioning inside Docker with stdin payload
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
      'dist/scripts/provision_team.js',
      '--json',
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

  // Write payload securely to stdin and close
  child.stdin.write(JSON.stringify({ teamName, email, password }));
  child.stdin.end();

  child.on('close', (code) => {
    if (code !== 0) {
      console.log('');
      if (stderrData.includes('TEAM_NAME_EXISTS') || stderrData.includes('Team already exists')) {
        console.error('ERROR:\nTeam already exists.');
      } else if (
        stderrData.includes('USERNAME_EXISTS') ||
        stderrData.includes('participant with this username already exists')
      ) {
        console.error('ERROR:\nA participant with this username already exists.');
      } else if (stderrData.includes('EMAIL_EXISTS') || stderrData.includes('Participant already exists')) {
        console.error('ERROR:\nParticipant already exists.');
      } else if (stderrData.includes('WEAK_PASSWORD') || stderrData.includes('Password must be at least 8')) {
        console.error('ERROR:\nPassword must be at least 8 characters.');
      } else if (stderrData.includes('INVALID_EMAIL')) {
        console.error('ERROR:\nValid participant email is required.');
      } else if (stderrData.includes('INVALID_DERIVED_USERNAME')) {
        console.error(
          'ERROR:\nInvalid username derived from email. Must be 3-50 characters containing letters, numbers, underscores, hyphens, or periods.'
        );
      } else {
        const cleanErr = stderrData.replace(/npm notice[\s\S]*$/, '').trim();
        console.error(cleanErr || 'ERROR:\nFailed to provision team.');
      }
      process.exit(1);
    }

    try {
      // Find JSON line in stdout
      const lines = stdoutData.split('\n');
      const jsonLine = lines.find((l) => l.trim().startsWith('{') && l.trim().endsWith('}'));
      const parsed = jsonLine ? JSON.parse(jsonLine) : { team: { name: teamName }, participant: { email } };

      const lanIp = detectLanIp();
      const loginUrl = `http://${lanIp}/`;

      console.log('\nSUCCESS\n');
      console.log(`Team:\n${parsed.team.name}\n`);
      console.log(`Participant:\n${parsed.participant.email}\n`);
      console.log('The participant can now log in.');
      console.log('');
      console.log('============================================================');
      console.log(' TECHX CTF 2026 -- TEAM CREATED');
      console.log('============================================================');
      console.log('');
      console.log('TEAM:');
      console.log(parsed.team.name);
      console.log('');
      console.log('PARTICIPANT:');
      console.log(parsed.participant.email);
      console.log('');
      console.log('STATUS:');
      console.log('ACTIVE');
      console.log('');
      console.log('LOGIN:');
      console.log(loginUrl);
      console.log('');
      console.log('============================================================');
      process.exit(0);
    } catch {
      console.log('\nSUCCESS\n');
      console.log(`Team:\n${teamName}\n`);
      console.log(`Participant:\n${email}\n`);
      console.log('The participant can now log in.');
      process.exit(0);
    }
  });
}

main().catch((err) => {
  console.error('\nERROR:\n', err.message);
  process.exit(1);
});
