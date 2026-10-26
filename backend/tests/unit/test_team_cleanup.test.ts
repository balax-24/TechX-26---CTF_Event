import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { db } from '../../src/db/index.js';
import { teams, users, auditLogs } from '../../src/db/schema.js';
import { adminService } from '../../src/modules/admin/admin.service.js';
import { isTestAccount, lookupTestTeamSchema, cleanupTestTeamSchema } from '../../src/modules/admin/admin.schema.js';
import { generateCsrfToken } from '../../src/middleware/csrf.middleware.js';
import { getChallengeGatewayClient } from '../../src/modules/dynamic_challenges/challenge_gateway.client.js';
import { getRedisClient } from '../../src/cache/redis.js';
import { AuthUser } from '../../src/types/auth.js';

describe('Test Team Identification & Cleanup Suite', () => {
  let app: FastifyInstance;
  let participantToken: string;
  let adminToken: string;

  const adminActor = {
    id: '00000000-0000-0000-0000-000000000001',
    role: 'superadmin',
    ip: '127.0.0.1',
  };

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const participantUser: AuthUser = {
      id: 'p0000000-0000-0000-0000-000000000001',
      username: 'student1',
      email: 'student1@test.local',
      role: 'participant',
      teamId: 't0000000-0000-0000-0000-000000000001',
      teamRole: 'member',
    };
    participantToken = app.jwt.sign(participantUser);

    const adminUser: AuthUser = {
      id: 'a0000000-0000-0000-0000-000000000001',
      username: 'admin_master',
      email: 'admin@techx.lan',
      role: 'admin',
      teamId: null,
      teamRole: null,
    };
    adminToken = app.jwt.sign(adminUser);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. TEST ACCOUNT IDENTIFICATION CONVENTION & PROTECTION
  // ---------------------------------------------------------------------------
  describe('Test Account Safety & Identifier Verification', () => {
    it('accepts usernames starting with test_, test-, techx_test_, testuser, team_test_', () => {
      expect(isTestAccount('test_sentinel')).toBe(true);
      expect(isTestAccount('test-hacker')).toBe(true);
      expect(isTestAccount('techx_test_operative')).toBe(true);
      expect(isTestAccount('testuser_99')).toBe(true);
      expect(isTestAccount('team_test_participant')).toBe(true);
      expect(isTestAccount('team_interactive_test_captain')).toBe(true);
      expect(isTestAccount('team_bat_runner')).toBe(true);
    });

    it('accepts accounts if team name matches test convention', () => {
      expect(isTestAccount('sentinel', 'TEST_SENTINEL')).toBe(true);
      expect(isTestAccount('alpha', 'techx_test_team')).toBe(true);
      expect(isTestAccount('charlie', 'TEAM_TEST_LEADERS')).toBe(true);
    });

    it('strictly REFUSES real competition usernames and teams without test markers', () => {
      expect(isTestAccount('sentinel_hawk')).toBe(false);
      expect(isTestAccount('admin')).toBe(false);
      expect(isTestAccount('cyber_dragon', 'Dragon_Force')).toBe(false);
      expect(isTestAccount('john_doe', 'ProductionTeamAlpha')).toBe(false);
    });

    it('validates cleanupTestTeamSchema requires non-empty strings', () => {
      const valid = cleanupTestTeamSchema.safeParse({
        username: 'test_sentinel',
        confirmation: 'DELETE test_sentinel',
      });
      expect(valid.success).toBe(true);

      const invalid = cleanupTestTeamSchema.safeParse({
        username: '',
        confirmation: '',
      });
      expect(invalid.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. LOOKUP SERVICE (NON-SENSITIVE DATA ONLY)
  // ---------------------------------------------------------------------------
  describe('lookupTestTeamByUsername', () => {
    it('throws USER_NOT_FOUND when user does not exist in database', async () => {
      vi.spyOn(db, 'select').mockReturnValue({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([]),
          }),
        }),
      } as any);

      await expect(
        adminService.lookupTestTeamByUsername('test_ghost')
      ).rejects.toThrow('USER_NOT_FOUND');
    });

    it('throws USER_HAS_NO_TEAM if participant has no team membership', async () => {
      let callCount = 0;
      vi.spyOn(db, 'select').mockImplementation(() => {
        callCount++;
        return {
          from: () => ({
            where: () => ({
              limit: () => {
                if (callCount === 1) {
                  return Promise.resolve([
                    { id: 'usr-test', username: 'test_solo', role: 'participant' },
                  ]);
                }
                return Promise.resolve([]);
              },
            }),
          }),
        } as any;
      });

      await expect(
        adminService.lookupTestTeamByUsername('test_solo')
      ).rejects.toThrow('USER_HAS_NO_TEAM');
    });

    it('throws NOT_A_TEST_ACCOUNT if user and team have no test markers', async () => {
      let callCount = 0;
      vi.spyOn(db, 'select').mockImplementation(() => {
        callCount++;
        return {
          from: () => ({
            where: () => ({
              limit: () => {
                if (callCount === 1) {
                  return Promise.resolve([
                    { id: 'usr-real', username: 'sentinel_hawk', role: 'participant' },
                  ]);
                }
                if (callCount === 2) {
                  return Promise.resolve([
                    { userId: 'usr-real', teamId: 'team-real-1', role: 'captain' },
                  ]);
                }
                if (callCount === 3) {
                  return Promise.resolve([
                    { id: 'team-real-1', name: 'RealDragonForce', score: 500, status: 'active', isBanned: false },
                  ]);
                }
                return Promise.resolve([]);
              },
            }),
          }),
        } as any;
      });

      await expect(
        adminService.lookupTestTeamByUsername('sentinel_hawk')
      ).rejects.toThrow('NOT_A_TEST_ACCOUNT');
    });

    it('returns non-sensitive summary (username, team, score, solves) and NO secrets', async () => {
      let callCount = 0;
      vi.spyOn(db, 'select').mockImplementation(() => {
        callCount++;
        return {
          from: () => ({
            where: () => ({
              limit: () => {
                if (callCount === 1) {
                  return Promise.resolve([
                    { id: 'usr-test-1', username: 'test_sentinel', role: 'participant', passwordHash: 'SECRET_HASH' },
                  ]);
                }
                if (callCount === 2) {
                  return Promise.resolve([
                    { userId: 'usr-test-1', teamId: 'team-test-1', role: 'captain' },
                  ]);
                }
                if (callCount === 3) {
                  return Promise.resolve([
                    { id: 'team-test-1', name: 'TEST_SENTINEL', score: 350, status: 'active', isBanned: false },
                  ]);
                }
                return Promise.resolve([]);
              },
              then: (resolve: any) => {
                return resolve([{ totalSolves: 3 }]);
              },
            }),
          }),
        } as any;
      });

      const result = await adminService.lookupTestTeamByUsername('test_sentinel');

      expect(result.username).toBe('test_sentinel');
      expect(result.teamName).toBe('TEST_SENTINEL');
      expect(result.score).toBe(350);
      expect(result.solves).toBe(3);

      // Verify no sensitive fields returned
      const resultObj = result as any;
      expect(resultObj.password).toBeUndefined();
      expect(resultObj.passwordHash).toBeUndefined();
      expect(resultObj.token).toBeUndefined();
      expect(resultObj.flags).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 3. CLEANUP SERVICE TRANSACTIONAL GUARANTEES & LEADERBOARD RECONCILIATION
  // ---------------------------------------------------------------------------
  describe('cleanupTestTeamByUsername', () => {
    it('throws CANCELLED when confirmation does not equal DELETE <username>', async () => {
      vi.spyOn(adminService, 'lookupTestTeamByUsername').mockResolvedValue({
        username: 'test_sentinel',
        userId: 'usr-test-1',
        teamId: 'team-test-1',
        teamName: 'TEST_SENTINEL',
        score: 350,
        solves: 3,
      });

      await expect(
        adminService.cleanupTestTeamByUsername('test_sentinel', 'DELETE wrong_target', adminActor)
      ).rejects.toThrow('CANCELLED');
    });

    it('refuses deletion if account is not a test account', async () => {
      vi.spyOn(adminService, 'lookupTestTeamByUsername').mockRejectedValue(
        new Error('NOT_A_TEST_ACCOUNT')
      );

      await expect(
        adminService.cleanupTestTeamByUsername('sentinel_hawk', 'DELETE sentinel_hawk', adminActor)
      ).rejects.toThrow('NOT_A_TEST_ACCOUNT');
    });

    it('atomically removes team, participants, dynamic instances, verifies leaderboard and audits', async () => {
      // 1. Mock lookup
      vi.spyOn(adminService, 'lookupTestTeamByUsername').mockResolvedValue({
        username: 'test_sentinel',
        userId: 'usr-test-1',
        teamId: 'team-test-1',
        teamName: 'TEST_SENTINEL',
        score: 350,
        solves: 3,
      });

      // 2. Mock challenge gateway client
      const gwClient = getChallengeGatewayClient();
      const stopInstanceSpy = vi.spyOn(gwClient, 'stopAndRemoveInstance').mockResolvedValue(true);
      const stopContainerSpy = vi.spyOn(gwClient, 'stopAndRemoveContainer').mockResolvedValue(true);

      // Mock db.select for challengeInstances
      vi.spyOn(db, 'select').mockReturnValue({
        from: () => ({
          where: () => Promise.resolve([
            { id: 'inst-1', containerId: 'docker-c1', status: 'running' },
          ]),
        }),
      } as any);

      // 3. Mock db transaction
      const deletedTables: any[] = [];
      const updatedTables: any[] = [];
      const insertedAudits: any[] = [];

      vi.spyOn(db, 'transaction').mockImplementation(async (cb: any) => {
        const mockTx = {
          select: () => ({
            from: () => ({
              where: () => Promise.resolve([
                { id: 'inst-1', containerId: 'docker-c1', networkId: 'net-1' },
              ]),
            }),
          }),
          update: (table: any) => ({
            set: (vals: any) => ({
              where: () => {
                updatedTables.push({ table, vals });
                return Promise.resolve();
              },
            }),
          }),
          delete: (table: any) => ({
            where: () => {
              deletedTables.push(table);
              return Promise.resolve();
            },
          }),
          insert: (table: any) => ({
            values: (vals: any) => {
              if (table === auditLogs) {
                insertedAudits.push(vals);
              }
              return Promise.resolve();
            },
          }),
        };
        return cb(mockTx);
      });

      // 4. Mock leaderboard snapshot check (PostgreSQL authoritative)
      const leaderboardService = (await import('../../src/modules/leaderboard/leaderboard.service.js')).leaderboardService;
      vi.spyOn(leaderboardService, 'getLeaderboardSnapshot').mockResolvedValue({
        entries: [
          { teamId: 'team-real-1', teamName: 'Real Dragons', score: 1000, solves: 5, rank: 1, lastSolveAt: null },
        ],
        leaderboardVersion: 42,
        generatedAt: new Date().toISOString(),
      });

      // 5. Mock Redis publish
      const redis = getRedisClient();
      (redis as any).status = 'ready';
      const redisPublishSpy = vi.spyOn(redis, 'publish').mockResolvedValue(1);

      const result = await adminService.cleanupTestTeamByUsername(
        'test_sentinel',
        'DELETE test_sentinel',
        adminActor
      );

      expect(result.success).toBe(true);
      expect(result.participant).toBe('test_sentinel');
      expect(result.team).toBe('TEST_SENTINEL');
      expect(result.leaderboardRemoved).toBe(true);
      expect(result.redisVerified).toBe(true);
      expect(result.dynamicResourcesCleaned).toBe(true);
      expect(result.databaseCommitted).toBe(true);
      expect(result.auditRecorded).toBe(true);

      // Dynamic challenge instances stopped
      expect(stopInstanceSpy).toHaveBeenCalledWith('inst-1');
      expect(stopContainerSpy).toHaveBeenCalledWith('docker-c1');

      // Database tables deleted: teams and users
      expect(deletedTables).toContain(teams);
      expect(deletedTables).toContain(users);

      // Audit log recorded
      expect(insertedAudits.length).toBeGreaterThan(0);
      expect(insertedAudits[0].action).toBe('TEST_TEAM_CLEANED');
      expect(insertedAudits[0].previousState.teamName).toBe('TEST_SENTINEL');

      // Redis event published to update connected SSE clients
      expect(redisPublishSpy).toHaveBeenCalled();
    });

    it('rolls back database transaction on failure', async () => {
      vi.spyOn(adminService, 'lookupTestTeamByUsername').mockResolvedValue({
        username: 'test_sentinel',
        userId: 'usr-test-1',
        teamId: 'team-test-1',
        teamName: 'TEST_SENTINEL',
        score: 350,
        solves: 3,
      });

      vi.spyOn(db, 'transaction').mockRejectedValue(new Error('DATABASE_CONNECTION_LOST'));

      await expect(
        adminService.cleanupTestTeamByUsername('test_sentinel', 'DELETE test_sentinel', adminActor)
      ).rejects.toThrow('DATABASE_CONNECTION_LOST');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. ROUTE AUTHORIZATION & RBAC GATING
  // ---------------------------------------------------------------------------
  describe('Test Team Cleanup HTTP Route Security', () => {
    it('rejects unauthenticated calls to POST /api/v1/admin/test-teams/lookup with 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/test-teams/lookup',
        payload: { username: 'test_sentinel' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects participant calls to POST /api/v1/admin/test-teams/lookup with 403', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/test-teams/lookup',
        headers: { authorization: `Bearer ${participantToken}` },
        payload: { username: 'test_sentinel' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('rejects unauthenticated calls to POST /api/v1/admin/test-teams/cleanup with 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/test-teams/cleanup',
        payload: { username: 'test_sentinel', confirmation: 'DELETE test_sentinel' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects participant calls to POST /api/v1/admin/test-teams/cleanup with 403', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/test-teams/cleanup',
        headers: {
          authorization: `Bearer ${participantToken}`,
          'x-csrf-token': generateCsrfToken('test-session'),
        },
        payload: { username: 'test_sentinel', confirmation: 'DELETE test_sentinel' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('allows admin lookup and returns 200 with non-sensitive details', async () => {
      vi.spyOn(adminService, 'lookupTestTeamByUsername').mockResolvedValue({
        username: 'test_sentinel',
        userId: 'usr-test-1',
        teamId: 'team-test-1',
        teamName: 'TEST_SENTINEL',
        score: 350,
        solves: 3,
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/test-teams/lookup',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { username: 'test_sentinel' },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.username).toBe('test_sentinel');
      expect(data.teamName).toBe('TEST_SENTINEL');
      expect(data.score).toBe(350);
      expect(data.solves).toBe(3);
    });
  });
});
