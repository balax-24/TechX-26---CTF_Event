import { db } from '../db/index.js';
import { users, teams, teamMembers } from '../db/schema.js';
import { sql, inArray } from 'drizzle-orm';
import crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_techx_ctf_change_me_in_production_32chars!';

function signJwt(payload: any): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400,
    })
  ).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

export async function seedSimulationTeams(teamCount = 100, membersPerTeam = 4) {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_STAGING_SEED !== 'true') {
    throw new Error('SAFETY ABORT: seedSimulationTeams cannot be executed in NODE_ENV=production without ALLOW_STAGING_SEED=true');
  }
  console.log(`[+] Seeding ${teamCount} teams and ${teamCount * membersPerTeam} participants...`);

  const fakeHash = '$argon2id$v=19$m=65536,t=3,p=4$simulated_hash_for_load_testing';
  const inviteCodeHash = crypto.createHash('sha256').update('SIM_INVITE_2026').digest('hex');

  const teamData: Array<{ id: string; name: string; inviteCodeHash: string; captainId: string }> = [];
  const userData: Array<{ id: string; username: string; email: string; passwordHash: string; role: string }> = [];
  const memberData: Array<{ id: string; teamId: string; userId: string; role: string }> = [];
  const outputParticipants: Array<{
    id: string;
    username: string;
    email: string;
    teamId: string;
    teamName: string;
    token: string;
  }> = [];

  for (let t = 1; t <= teamCount; t++) {
    const teamId = crypto.randomUUID();
    const teamName = `SimTeam_${String(t).padStart(3, '0')}`;
    let captainId = '';

    for (let m = 1; m <= membersPerTeam; m++) {
      const userIndex = (t - 1) * membersPerTeam + m;
      const userId = crypto.randomUUID();
      const username = `sim_p_${String(userIndex).padStart(3, '0')}`;
      const email = `${username}@simulation.local`;
      const role = m === 1 ? 'captain' : 'member';
      if (m === 1) captainId = userId;

      userData.push({
        id: userId,
        username,
        email,
        passwordHash: fakeHash,
        role: 'participant',
      });

      memberData.push({
        id: crypto.randomUUID(),
        teamId,
        userId,
        role,
      });

      const token = signJwt({
        id: userId,
        username,
        email,
        role: 'participant',
        teamId,
        teamRole: role,
      });

      outputParticipants.push({
        id: userId,
        username,
        email,
        teamId,
        teamName,
        token,
      });
    }

    teamData.push({
      id: teamId,
      name: teamName,
      inviteCodeHash,
      captainId,
    });
  }

  // Batch insert users (in chunks of 100)
  console.log('[+] Inserting users into DB...');
  for (let i = 0; i < userData.length; i += 100) {
    const chunk = userData.slice(i, i + 100);
    await db.insert(users).values(chunk as any).onConflictDoNothing();
  }

  // Batch insert teams (in chunks of 50)
  console.log('[+] Inserting teams into DB...');
  for (let i = 0; i < teamData.length; i += 50) {
    const chunk = teamData.slice(i, i + 50);
    await db.insert(teams).values(chunk as any).onConflictDoNothing();
  }

  // Batch insert members (in chunks of 100)
  console.log('[+] Inserting team members into DB...');
  for (let i = 0; i < memberData.length; i += 100) {
    const chunk = memberData.slice(i, i + 100);
    await db.insert(teamMembers).values(chunk as any).onConflictDoNothing();
  }

  const outDir = path.resolve(process.cwd(), 'tests', 'simulation');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const outPath = path.join(outDir, 'simulation_users.json');
  fs.writeFileSync(outPath, JSON.stringify(outputParticipants, null, 2));

  console.log(`[✓] Successfully seeded ${teamData.length} teams and ${outputParticipants.length} participants.`);
  console.log(`[✓] Saved credentials to ${outPath}`);
  return outputParticipants;
}

if (process.argv[1]?.includes('seed_simulation_teams')) {
  seedSimulationTeams(100, 4)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[-] Seeding failed:', err);
      process.exit(1);
    });
}
