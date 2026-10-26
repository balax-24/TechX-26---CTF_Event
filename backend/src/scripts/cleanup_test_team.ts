import { pool } from '../db/index.js';
import { adminService } from '../modules/admin/admin.service.js';

interface CliArgs {
  action?: 'lookup' | 'cleanup';
  username?: string;
  confirmation?: string;
  jsonOutput?: boolean;
}

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--lookup' || arg === '-l') {
      result.action = 'lookup';
      result.username = args[++i];
    } else if (arg === '--cleanup' || arg === '-c') {
      result.action = 'cleanup';
      result.username = args[++i];
    } else if (arg === '--confirm') {
      result.confirmation = args[++i];
    } else if (arg === '--action' || arg === '-a') {
      result.action = args[++i] as 'lookup' | 'cleanup';
    } else if (arg === '--username' || arg === '-u') {
      result.username = args[++i];
    } else if (arg === '--json') {
      result.jsonOutput = true;
    }
  }
  return result;
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return '';
  }
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');

    const timer = setTimeout(() => {
      resolve(data);
    }, 200);

    process.stdin.on('data', (chunk) => {
      data += chunk;
    });

    process.stdin.on('end', () => {
      clearTimeout(timer);
      resolve(data);
    });

    process.stdin.on('error', () => {
      clearTimeout(timer);
      resolve('');
    });
  });
}

export async function runCleanupCli(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  let action = args.action;
  let username = args.username;
  let confirmation = args.confirmation;

  // Only read stdin if username wasn't already provided via CLI flags
  if (!username) {
    const rawStdin = (await readStdin()).trim();
    if (rawStdin.startsWith('{') && rawStdin.endsWith('}')) {
      try {
        const parsed = JSON.parse(rawStdin);
        action = parsed.action || action;
        username = parsed.username || username;
        confirmation = parsed.confirmation || confirmation;
      } catch {
        // not json
      }
    }
  }

  if (!username) {
    console.error('ERROR:\nUSER_NOT_FOUND: Participant username is required.');
    await pool.end();
    process.exit(1);
  }

  // Default action to cleanup if confirmation is provided, otherwise lookup
  if (!action) {
    action = confirmation ? 'cleanup' : 'lookup';
  }

  const systemActor = {
    id: '00000000-0000-0000-0000-000000000000',
    role: 'system',
    ip: '127.0.0.1',
  };

  try {
    if (action === 'lookup') {
      const result = await adminService.lookupTestTeamByUsername(username);

      if (args.jsonOutput) {
        console.log(
          JSON.stringify({
            success: true,
            lookup: {
              username: result.username,
              teamName: result.teamName,
              teamId: result.teamId,
              score: result.score,
              solves: result.solves,
            },
          })
        );
      } else {
        console.log('\nParticipant found.\n');
        console.log(`Username:\n${result.username}\n`);
        console.log(`Team:\n${result.teamName}\n`);
        console.log(`Score:\n${result.score}\n`);
        console.log(`Solves:\n${result.solves}\n`);
      }

      await pool.end();
      process.exit(0);
    } else if (action === 'cleanup') {
      if (!confirmation) {
        console.error('CANCELLED.\nNo changes were made.');
        await pool.end();
        process.exit(1);
      }

      const result = await adminService.cleanupTestTeamByUsername(
        username,
        confirmation,
        systemActor
      );

      if (args.jsonOutput) {
        console.log(
          JSON.stringify({
            success: true,
            participant: result.participant,
            team: result.team,
            leaderboard: 'REMOVED',
            redis: 'VERIFIED',
            dynamicResources: 'CLEANED',
            database: 'CLEANUP COMMITTED',
            audit: 'RECORDED',
          })
        );
      } else {
        console.log('\n============================================================');
        console.log(' TEST TEAM CLEANUP COMPLETE');
        console.log('============================================================\n');
        console.log(`Participant:\n${result.participant}\n`);
        console.log(`Team:\n${result.team}\n`);
        console.log('Leaderboard:\nREMOVED\n');
        console.log('Redis:\nVERIFIED\n');
        console.log('Dynamic Challenge Resources:\nCLEANED\n');
        console.log('Database:\nCLEANUP COMMITTED\n');
        console.log('Audit:\nRECORDED\n');
        console.log('============================================================');
      }

      await pool.end();
      process.exit(0);
    } else {
      console.error('ERROR:\nInvalid action. Use --lookup or --cleanup.');
      await pool.end();
      process.exit(1);
    }
  } catch (err: any) {
    await pool.end();

    const msg = err.message || '';
    if (msg === 'USER_NOT_FOUND') {
      console.error('ERROR:\nUSER_NOT_FOUND: Participant does not exist.');
    } else if (msg === 'USER_HAS_NO_TEAM') {
      console.error('ERROR:\nUSER_HAS_NO_TEAM: Participant is not assigned to any team.');
    } else if (msg === 'NOT_A_TEST_ACCOUNT') {
      console.error('REFUSED:\nThis participant is not marked as a test account.\nNo changes made.');
    } else if (msg === 'CANCELLED') {
      console.error('CANCELLED.\nNo changes were made.');
    } else {
      console.error(`ERROR:\nCLEANUP_FAILED: ${msg}`);
    }

    process.exit(1);
  }
}

// Standalone execution handler
if (
  process.argv[1] &&
  (process.argv[1].endsWith('cleanup_test_team.ts') || process.argv[1].endsWith('cleanup_test_team.js'))
) {
  runCleanupCli().catch((err) => {
    console.error(`ERROR:\nCLEANUP_FAILED: ${err.message}`);
    pool.end().finally(() => process.exit(1));
  });
}
