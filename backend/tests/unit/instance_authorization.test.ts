import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DynamicChallengesService } from '../../src/modules/dynamic_challenges/dynamic_challenges.service.js';
import { dynamicChallengeRegistry } from '../../src/modules/dynamic_challenges/dynamic_challenges.registry.js';
import { db } from '../../src/db/index.js';
import { competitionService } from '../../src/modules/competition/competition.service.js';

describe('Stage 8: Dynamic Challenge Instance Authorization & Access Control', () => {
  let service: DynamicChallengesService;

  beforeEach(() => {
    service = new DynamicChallengesService();
    vi.restoreAllMocks();
  });

  it('rejects unauthenticated or teamless users from starting an instance', async () => {
    // If teamId is empty or invalid, database team lookup fails
    vi.spyOn(competitionService, 'requireLiveCompetition').mockResolvedValue(undefined);
    vi.spyOn(db, 'select').mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]), // No team found
        }),
      }),
    } as any);

    await expect(
      service.startInstance({
        slug: 'intro-sqli-sandbox',
        userId: 'u1111111-1111-4111-8111-111111111111',
        teamId: 'invalid-team-id',
        ipAddress: '127.0.0.1',
      })
    ).rejects.toThrow('TEAM_NOT_FOUND');
  });

  it('prohibits administrators from participating through dynamic challenge creation', async () => {
    await expect(
      service.startInstance({
        slug: 'intro-sqli-sandbox',
        userId: 'admin-id',
        teamId: 'team-id',
        ipAddress: '127.0.0.1',
        isAdmin: true,
      })
    ).rejects.toThrow('ADMIN_PARTICIPATION_FORBIDDEN');
  });

  it('strictly blocks disqualified teams from starting, resetting, or controlling instances', async () => {
    vi.spyOn(competitionService, 'requireLiveCompetition').mockResolvedValue(undefined);
    vi.spyOn(db, 'select').mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            { id: 'team-disqualified', status: 'disqualified' },
          ]),
        }),
      }),
    } as any);

    await expect(
      service.startInstance({
        slug: 'intro-sqli-sandbox',
        userId: 'u1111111-1111-4111-8111-111111111111',
        teamId: 'team-disqualified',
        ipAddress: '127.0.0.1',
      })
    ).rejects.toThrow('TEAM_DISQUALIFIED');
  });

  it('strictly blocks disabled teams from starting instances', async () => {
    vi.spyOn(competitionService, 'requireLiveCompetition').mockResolvedValue(undefined);
    vi.spyOn(db, 'select').mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            { id: 'team-disabled', status: 'disabled' },
          ]),
        }),
      }),
    } as any);

    await expect(
      service.startInstance({
        slug: 'intro-sqli-sandbox',
        userId: 'u1111111-1111-4111-8111-111111111111',
        teamId: 'team-disabled',
        ipAddress: '127.0.0.1',
      })
    ).rejects.toThrow('TEAM_DISABLED');
  });

  it('blocks instance mutations when competition is paused', async () => {
    vi.spyOn(competitionService, 'requireLiveCompetition').mockRejectedValue(
      new Error('COMPETITION_PAUSED')
    );

    await expect(
      service.startInstance({
        slug: 'intro-sqli-sandbox',
        userId: 'u1111111-1111-4111-8111-111111111111',
        teamId: 'team-active',
        ipAddress: '127.0.0.1',
      })
    ).rejects.toThrow('COMPETITION_PAUSED');
  });

  it('blocks instance mutations when competition has ended', async () => {
    vi.spyOn(competitionService, 'requireLiveCompetition').mockRejectedValue(
      new Error('COMPETITION_ENDED')
    );

    await expect(
      service.startInstance({
        slug: 'intro-sqli-sandbox',
        userId: 'u1111111-1111-4111-8111-111111111111',
        teamId: 'team-active',
        ipAddress: '127.0.0.1',
      })
    ).rejects.toThrow('COMPETITION_ENDED');
  });

  it('enforces that Team A cannot access or proxy Team B instance', async () => {
    // Team A asks for proxy target, but instance belongs to Team B
    vi.spyOn(db, 'select').mockImplementation(((fields: any) => {
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              // Challenge exists
              if (fields?.id) {
                return Promise.resolve([{ id: 'c1111111-1111-4111-8111-111111111111' }]);
              }
              // Challenge instance lookup with teamId filter returns nothing for Team A
              return Promise.resolve([]);
            }),
          }),
        }),
      } as any;
    }) as any);

    await expect(
      service.getProxyTarget({
        slug: 'intro-sqli-sandbox',
        teamId: 'team-a-id',
      })
    ).rejects.toThrow('INSTANCE_NOT_RUNNING');
  });

  it('rejects stopping an instance when team does not own an active instance', async () => {
    vi.spyOn(db, 'select').mockImplementation(((fields: any) => {
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              if (fields?.id) {
                return Promise.resolve([{ id: 'c1111111-1111-4111-8111-111111111111', slug: 'intro-sqli-sandbox' }]);
              }
              return Promise.resolve([]); // No instance found for this team
            }),
          }),
        }),
      } as any;
    }) as any);

    await expect(
      service.stopInstance({
        slug: 'intro-sqli-sandbox',
        userId: 'u-1',
        teamId: 'team-a-id',
        ipAddress: '127.0.0.1',
      })
    ).rejects.toThrow('INSTANCE_NOT_FOUND');
  });
});
