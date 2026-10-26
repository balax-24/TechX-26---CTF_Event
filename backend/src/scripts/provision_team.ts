import { pool } from '../db/index.js';
import { adminService } from '../modules/admin/admin.service.js';

interface CliArgs {
  teamName?: string;
  email?: string;
  username?: string;
  jsonOutput?: boolean;
}

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--team' || arg === '-t') {
      result.teamName = args[++i];
    } else if (arg === '--email' || arg === '-e') {
      result.email = args[++i];
    } else if (arg === '--username' || arg === '-u') {
      result.username = args[++i];
    } else if (arg === '--json') {
      result.jsonOutput = true;
    }
  }
  return result;
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', (chunk) => {
      data += chunk;
    });

    process.stdin.on('end', () => {
      resolve(data);
    });

    process.stdin.on('error', (err) => {
      reject(err);
    });

    // In non-interactive contexts if stdin is empty and closed
    if (process.stdin.isTTY) {
      resolve('');
    }
  });
}

export async function runProvisionCli(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const rawStdin = (await readStdin()).trim();

  let teamName = args.teamName;
  let email = args.email;
  let username = args.username;
  let password = '';

  // Check if stdin is a JSON payload
  if (rawStdin.startsWith('{') && rawStdin.endsWith('}')) {
    try {
      const parsed = JSON.parse(rawStdin);
      teamName = parsed.teamName || teamName;
      email = parsed.email || email;
      username = parsed.username || username;
      password = parsed.password || '';
    } catch {
      password = rawStdin;
    }
  } else {
    password = rawStdin;
  }

  if (!teamName) {
    console.error('ERROR:\nTeam name is required.');
    process.exit(1);
  }

  if (!email) {
    console.error('ERROR:\nParticipant email is required.');
    process.exit(1);
  }

  if (!password) {
    console.error('ERROR:\nParticipant password is required.');
    process.exit(1);
  }

  try {
    if (!args.jsonOutput) {
      console.log('Creating team...');
      console.log('Creating participant...');
      console.log('Assigning participant to team...');
    }

    const result = await adminService.provisionTeamWithParticipant(
      {
        teamName,
        email,
        password,
        username,
        reason: 'Internal organizer CLI provisioning',
      },
      {
        id: '00000000-0000-0000-0000-000000000000',
        role: 'system',
        ip: '127.0.0.1',
      }
    );

    if (args.jsonOutput) {
      console.log(
        JSON.stringify({
          success: true,
          team: result.team,
          participant: result.participant,
        })
      );
    } else {
      console.log('\nSUCCESS\n');
      console.log(`Team:\n${result.team.name}\n`);
      console.log(`Participant:\n${result.participant.email}\n`);
      console.log('The participant can now log in.');
    }

    await pool.end();
    process.exit(0);
  } catch (err: any) {
    await pool.end();

    const msg = err.message || '';
    if (msg === 'TEAM_NAME_EXISTS') {
      console.error('ERROR:\nTeam already exists.');
    } else if (msg === 'USERNAME_EXISTS') {
      console.error('ERROR:\nA participant with this username already exists.');
    } else if (msg === 'EMAIL_EXISTS') {
      console.error('ERROR:\nParticipant already exists.');
    } else if (msg === 'WEAK_PASSWORD') {
      console.error('ERROR:\nPassword must be at least 8 characters.');
    } else if (msg === 'INVALID_EMAIL') {
      console.error('ERROR:\nValid participant email is required.');
    } else if (msg === 'INVALID_TEAM_NAME') {
      console.error('ERROR:\nTeam name must be between 2 and 100 characters.');
    } else if (msg === 'INVALID_DERIVED_USERNAME') {
      console.error(
        'ERROR:\nInvalid username derived from email. Must be 3-50 characters containing letters, numbers, underscores, hyphens, or periods.'
      );
    } else {
      console.error(`ERROR:\n${msg}`);
    }

    process.exit(1);
  }
}

// Standalone execution handler
if (
  process.argv[1] &&
  (process.argv[1].endsWith('provision_team.ts') || process.argv[1].endsWith('provision_team.js'))
) {
  runProvisionCli().catch((err) => {
    console.error(`ERROR:\n${err.message}`);
    pool.end().finally(() => process.exit(1));
  });
}
