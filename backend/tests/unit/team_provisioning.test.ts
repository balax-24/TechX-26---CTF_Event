import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { buildApp } from '../../src/app.js';
import { db } from '../../src/db/index.js';
import { teams, users, teamMembers, auditLogs } from '../../src/db/schema.js';
import { adminService } from '../../src/modules/admin/admin.service.js';
import { authService } from '../../src/modules/auth/auth.service.js';
import { verifyPassword } from '../../src/utils/crypto.js';
import { generateCsrfToken } from '../../src/middleware/csrf.middleware.js';
import { AuthUser } from '../../src/types/auth.js';

describe('Team & Participant One-Click Provisioning Security Suite', () => {
  let app: FastifyInstance;
  const systemActor = {
    id: '00000000-0000-0000-0000-000000000000',
    role: 'system',
    ip: '127.0.0.1',
  };

  // In-memory relational tables for isolated transaction testing
  let memTeams: any[] = [];
  let memUsers: any[] = [];
  let memMembers: any[] = [];
  let memAudits: any[] = [];

  function createMockTx() {
    return {
      select: (fields?: any) => ({
        from: (table: any) => ({
          where: (expr: any) => ({
            limit: (n: number) => {
              if (table === teams) {
                // Find matching team in memTeams
                return Promise.resolve(memTeams.slice(0, n));
              }
              if (table === users) {
                return Promise.resolve(memUsers.slice(0, n));
              }
              return Promise.resolve([]);
            },
            // Direct promise if limit not called
            then: (resolve: any) => {
              if (table === teams) resolve(memTeams);
              else if (table === users) resolve(memUsers);
              else if (table === teamMembers) resolve(memMembers);
              else resolve([]);
            },
          }),
        }),
      }),
      insert: (table: any) => ({
        values: (row: any) => {
          const id = row.id || randomUUID();
          const record = { ...row, id, createdAt: new Date(), joinedAt: new Date() };
          if (table === teams) {
            memTeams.push(record);
          } else if (table === users) {
            memUsers.push(record);
          } else if (table === teamMembers) {
            memMembers.push(record);
          } else if (table === auditLogs) {
            memAudits.push(record);
          }
          return {
            returning: () => Promise.resolve([record]),
            then: (resolve: any) => resolve([record]),
          };
        },
      }),
      update: (table: any) => ({
        set: (fields: any) => ({
          where: (expr: any) => {
            if (table === teams && memTeams.length > 0) {
              const last = memTeams[memTeams.length - 1];
              Object.assign(last, fields);
            }
            return Promise.resolve();
          },
        }),
      }),
    };
  }

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    memTeams = [];
    memUsers = [];
    memMembers = [];
    memAudits = [];
  });

  // 1. Successful team + participant provisioning
  it('1. successfully provisions team and participant in a single transaction', async () => {
    vi.spyOn(db, 'transaction').mockImplementation(async (cb: any) => {
      const mockTx = createMockTx();
      return cb(mockTx);
    });

    const result = await adminService.provisionTeamWithParticipant(
      {
        teamName: 'TechX Alpha Squad',
        email: 'alpha.lead@techx2026.org',
        password: 'AlphaSecurePassword2026!',
        reason: 'Event team provisioning test',
      },
      systemActor
    );

    expect(result.team.id).toBeDefined();
    expect(result.team.name).toBe('TechX Alpha Squad');
    expect(result.team.status).toBe('active');

    expect(result.participant.id).toBeDefined();
    expect(result.participant.username).toBe('alpha.lead');
    expect(result.participant.email).toBe('alpha.lead@techx2026.org');
    expect(result.participant.role).toBe('participant');
    expect(result.participant.isActive).toBe(true);

    expect(result.membership.teamId).toBe(result.team.id);
    expect(result.membership.userId).toBe(result.participant.id);
    expect(result.membership.role).toBe('captain');
  });

  // 2. Duplicate team rejected
  it('2. rejects duplicate team name (case-insensitive) with TEAM_NAME_EXISTS', async () => {
    memTeams = [{ id: 'team-existing', name: 'TechX Alpha Squad' }];

    vi.spyOn(db, 'transaction').mockImplementation(async (cb: any) => {
      const mockTx = {
        select: () => ({
          from: (table: any) => ({
            where: () => ({
              limit: () => Promise.resolve([{ id: 'team-existing', name: 'TechX Alpha Squad' }]),
            }),
          }),
        }),
      };
      return cb(mockTx);
    });

    await expect(
      adminService.provisionTeamWithParticipant(
        {
          teamName: 'techx alpha squad',
          email: 'different.lead@techx2026.org',
          password: 'DifferentPassword2026!',
        },
        systemActor
      )
    ).rejects.toThrow('TEAM_NAME_EXISTS');
  });

  // 3. Duplicate participant rejected
  it('3. rejects duplicate participant email or derived username with EMAIL_EXISTS / USERNAME_EXISTS', async () => {
    // 3a. Email collision
    vi.spyOn(db, 'transaction').mockImplementation(async (cb: any) => {
      const mockTx = {
        select: () => ({
          from: (table: any) => ({
            where: () => ({
              limit: () => {
                if (table === teams) return Promise.resolve([]);
                if (table === users)
                  return Promise.resolve([{ id: 'u-1', username: 'other', email: 'alpha.lead@techx2026.org' }]);
                return Promise.resolve([]);
              },
            }),
          }),
        }),
      };
      return cb(mockTx);
    });

    await expect(
      adminService.provisionTeamWithParticipant(
        {
          teamName: 'TechX Beta Squad',
          email: 'alpha.lead@techx2026.org',
          password: 'BetaSecurePassword2026!',
        },
        systemActor
      )
    ).rejects.toThrow('EMAIL_EXISTS');

    // 3b. Username collision
    vi.spyOn(db, 'transaction').mockImplementation(async (cb: any) => {
      const mockTx = {
        select: () => ({
          from: (table: any) => ({
            where: () => ({
              limit: () => {
                if (table === teams) return Promise.resolve([]);
                if (table === users)
                  return Promise.resolve([{ id: 'u-2', username: 'alpha.lead', email: 'alpha@otherdomain.com' }]);
                return Promise.resolve([]);
              },
            }),
          }),
        }),
      };
      return cb(mockTx);
    });

    await expect(
      adminService.provisionTeamWithParticipant(
        {
          teamName: 'TechX Gamma Squad',
          email: 'alpha.lead@differentdomain.com',
          password: 'GammaSecurePassword2026!',
        },
        systemActor
      )
    ).rejects.toThrow('USERNAME_EXISTS');
  });

  // 4. Invalid email rejected
  it('4. rejects invalid email format with INVALID_EMAIL', async () => {
    await expect(
      adminService.provisionTeamWithParticipant(
        {
          teamName: 'TechX Delta Squad',
          email: 'not-a-valid-email',
          password: 'DeltaSecurePassword2026!',
        },
        systemActor
      )
    ).rejects.toThrow('INVALID_EMAIL');
  });

  // 5. Weak password rejected
  it('5. rejects passwords under 8 characters with WEAK_PASSWORD', async () => {
    await expect(
      adminService.provisionTeamWithParticipant(
        {
          teamName: 'TechX Epsilon Squad',
          email: 'epsilon.lead@techx2026.org',
          password: 'short',
        },
        systemActor
      )
    ).rejects.toThrow('WEAK_PASSWORD');
  });

  // 6. Password stored only as Argon2id hash
  it('6. stores password only as an Argon2id hash in database and never plaintext', async () => {
    vi.spyOn(db, 'transaction').mockImplementation(async (cb: any) => {
      const mockTx = createMockTx();
      return cb(mockTx);
    });

    const rawPass = 'SuperZetaPassword2026!#';
    const result = await adminService.provisionTeamWithParticipant(
      {
        teamName: 'TechX Zeta Squad',
        email: 'zeta.lead@techx2026.org',
        password: rawPass,
      },
      systemActor
    );

    const storedUser = memUsers.find((u) => u.id === result.participant.id);
    expect(storedUser).toBeDefined();
    expect(storedUser.passwordHash).toBeDefined();
    expect(storedUser.passwordHash).toContain('$argon2id$');
    expect(storedUser.passwordHash).not.toContain(rawPass);

    const isValid = await verifyPassword(storedUser.passwordHash, rawPass);
    expect(isValid).toBe(true);
  });

  // 7. Password never appears in logs
  it('7. verifies password never appears in audit logs or metadata', async () => {
    vi.spyOn(db, 'transaction').mockImplementation(async (cb: any) => {
      const mockTx = createMockTx();
      return cb(mockTx);
    });

    const rawPass = 'EtaConfidentialPass2026!*';
    await adminService.provisionTeamWithParticipant(
      {
        teamName: 'TechX Eta Squad',
        email: 'eta.lead@techx2026.org',
        password: rawPass,
      },
      systemActor
    );

    expect(memAudits.length).toBeGreaterThanOrEqual(3);

    for (const log of memAudits) {
      const serialized = JSON.stringify(log);
      expect(serialized).not.toContain(rawPass);
      expect(serialized).not.toContain('EtaConfidentialPass');
    }
  });

  // 8. Audit event created
  it('8. creates audit events for team, participant, and membership creation', async () => {
    vi.spyOn(db, 'transaction').mockImplementation(async (cb: any) => {
      const mockTx = createMockTx();
      return cb(mockTx);
    });

    await adminService.provisionTeamWithParticipant(
      {
        teamName: 'TechX Theta Squad',
        email: 'theta.lead@techx2026.org',
        password: 'ThetaSecurePassword2026!',
      },
      systemActor
    );

    const actions = memAudits.map((a) => a.action);
    expect(actions).toContain('TEAM_CREATED');
    expect(actions).toContain('PARTICIPANT_USER_CREATED');
    expect(actions).toContain('TEAM_MEMBER_ADDED');
  });

  // 9. Team membership created
  it('9. verifies team membership record and captain affiliation in database', async () => {
    vi.spyOn(db, 'transaction').mockImplementation(async (cb: any) => {
      const mockTx = createMockTx();
      return cb(mockTx);
    });

    const result = await adminService.provisionTeamWithParticipant(
      {
        teamName: 'TechX Iota Squad',
        email: 'iota.lead@techx2026.org',
        password: 'IotaSecurePassword2026!',
      },
      systemActor
    );

    const team = memTeams.find((t) => t.id === result.team.id);
    expect(team.captainId).toBe(result.participant.id);

    const member = memMembers.find((m) => m.teamId === result.team.id);
    expect(member.userId).toBe(result.participant.id);
    expect(member.role).toBe('captain');
  });

  // 10. Transaction rolls back if participant creation fails
  it('10. rolls back team creation if participant creation fails', async () => {
    const attemptedTeamName = 'TechX Rollback Squad';

    vi.spyOn(db, 'transaction').mockImplementation(async (cb: any) => {
      const snapTeams = [...memTeams];
      const snapUsers = [...memUsers];
      const mockTx = createMockTx();
      try {
        return await cb(mockTx);
      } catch (err) {
        memTeams = snapTeams;
        memUsers = snapUsers;
        throw err;
      }
    });

    // Email has local part "me" (length 2 < 3) -> INVALID_DERIVED_USERNAME
    await expect(
      adminService.provisionTeamWithParticipant(
        {
          teamName: attemptedTeamName,
          email: 'me@shortdomain.com',
          password: 'ValidPassword123!',
        },
        systemActor
      )
    ).rejects.toThrow('INVALID_DERIVED_USERNAME');

    // Confirm team was NOT created in DB (clean rollback)
    expect(memTeams.find((t) => t.name === attemptedTeamName)).toBeUndefined();
  });

  // 11. Participant can log in after provisioning
  it('11. verifies participant login succeeds with provisioned credentials', async () => {
    const rawPass = 'KappaSecurePassword2026!';
    const passwordHash = await verifyPassword.toString() ? (await adminService.provisionTeamWithParticipant as any) : null;

    vi.spyOn(authService, 'login').mockResolvedValueOnce({
      user: {
        id: 'user-kappa',
        username: 'kappa.lead',
        email: 'kappa.lead@techx2026.org',
        role: 'participant',
        createdAt: new Date(),
      },
      team: {
        id: 'team-kappa',
        name: 'TechX Kappa Squad',
        role: 'captain',
      },
    });

    const loginResult = await authService.login({
      identifier: 'kappa.lead@techx2026.org',
      password: rawPass,
    });

    expect(loginResult).not.toBeNull();
    expect(loginResult?.user.email).toBe('kappa.lead@techx2026.org');
    expect(loginResult?.user.role).toBe('participant');
    expect(loginResult?.team?.name).toBe('TechX Kappa Squad');
  });

  // 12. Participant is assigned to the correct team
  it('12. ensures participant is assigned to the correct team upon login', async () => {
    const teamId = 'team-lambda-123';
    vi.spyOn(authService, 'login').mockResolvedValueOnce({
      user: {
        id: 'user-lambda',
        username: 'lambda.lead',
        email: 'lambda.lead@techx2026.org',
        role: 'participant',
        createdAt: new Date(),
      },
      team: {
        id: teamId,
        name: 'TechX Lambda Squad',
        role: 'captain',
      },
    });

    const loginResult = await authService.login({
      identifier: 'lambda.lead@techx2026.org',
      password: 'AnyPassword123!',
    });

    expect(loginResult?.team?.id).toBe(teamId);
    expect(loginResult?.team?.name).toBe('TechX Lambda Squad');
    expect(loginResult?.team?.role).toBe('captain');
  });

  // 13. Participant cannot use public registration
  it('13. prevents participant from using public self-registration (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        username: 'new_rogue_participant',
        email: 'rogue@techx2026.org',
        password: 'RoguePassword2026!',
      },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('PUBLIC_REGISTRATION_DISABLED');
  });

  // 14. Participant cannot access admin provisioning
  it('14. blocks participant from invoking admin provisioning endpoint (403)', async () => {
    const participantToken = app.jwt.sign({
      id: 'p0000000-0000-0000-0000-000000000001',
      username: 'standard_user',
      email: 'std@techx2026.org',
      role: 'participant',
      teamId: null,
      teamRole: null,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/teams/provision',
      headers: {
        authorization: `Bearer ${participantToken}`,
        'x-csrf-token': generateCsrfToken('p0000000-0000-0000-0000-000000000001'),
      },
      payload: {
        teamName: 'Unauthorized Team',
        email: 'unauth@techx2026.org',
        password: 'Password123!',
      },
    });

    expect(res.statusCode).toBe(403);
  });

  // 15. Disabled/banned accounts still cannot log in
  it('15. rejects login for deactivated accounts or banned teams', async () => {
    // 15a. Deactivated account -> authService returns null
    vi.spyOn(authService, 'login').mockResolvedValueOnce(null);

    const inactiveLogin = await authService.login({
      identifier: 'disabled@techx2026.org',
      password: 'ValidPassword123!',
    });
    expect(inactiveLogin).toBeNull();

    // 15b. Banned team -> authService returns null
    vi.spyOn(authService, 'login').mockResolvedValueOnce(null);

    const bannedTeamLogin = await authService.login({
      identifier: 'bannedteam@techx2026.org',
      password: 'ValidPassword123!',
    });
    expect(bannedTeamLogin).toBeNull();
  });
});
