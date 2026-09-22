import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DynamicChallengesService } from '../../src/modules/dynamic_challenges/dynamic_challenges.service.js';
import { db } from '../../src/db/index.js';
import { competitionService } from '../../src/modules/competition/competition.service.js';

describe('Stage 8: Resource Limits & Exhaustion Protection', () => {
  let service: DynamicChallengesService;

  const validChallenge = {
    id: 'c1111111-1111-4111-8111-111111111111',
    slug: 'intro-sqli-sandbox',
    status: 'published',
    releaseTime: null,
  };

  const validTeam = {
    id: 't1111111-1111-4111-8111-111111111111',
    status: 'active',
  };

  beforeEach(() => {
    service = new DynamicChallengesService();
    vi.restoreAllMocks();

    vi.spyOn(competitionService, 'requireLiveCompetition').mockResolvedValue(undefined);
  });

  it('enforces platform-wide global container capacity limit (CHALLENGE_CAPACITY_EXCEEDED)', async () => {
    service.MAX_GLOBAL_INSTANCES = 50;

    vi.spyOn(db, 'select').mockImplementation(((fields: any) => {
      // First call: check team
      // Second call: check challenge
      // Third call: check existing active for team+chal
      // Fourth call: check team count (0)
      // Fifth call: check global count (50 -> cap reached)
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            if (fields?.status && fields?.id) return Promise.resolve([validTeam]);
            if (fields?.slug) return Promise.resolve([validChallenge]);
            if (fields?.count) {
              // Simulate team has 0, but global has 50
              return Promise.resolve([{ count: 50 }]);
            }
            return Promise.resolve([]); // No existing active for this challenge
          }),
        }),
      } as any;
    }) as any);

    // Make team count return 0, global count return 50
    let countCall = 0;
    vi.spyOn(db, 'select').mockImplementation(((fields: any) => {
      if (fields?.count) {
        countCall++;
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: countCall === 1 ? 0 : 50 }]),
          }),
        } as any;
      }
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              if (fields?.slug) return Promise.resolve([validChallenge]);
              if (fields?.containerName || fields?.challengeId) return Promise.resolve([]);
              if (fields?.status && !fields?.slug && !fields?.containerName) return Promise.resolve([validTeam]);
              return Promise.resolve([]);
            }),
          }),
        }),
      } as any;
    }) as any);

    await expect(
      service.startInstance({
        slug: 'intro-sqli-sandbox',
        userId: 'u-1',
        teamId: validTeam.id,
        ipAddress: '127.0.0.1',
      })
    ).rejects.toThrow('CHALLENGE_CAPACITY_EXCEEDED');
  });

  it('rejects starting instance if challenge is not registered in dynamic registry', async () => {
    vi.spyOn(db, 'select').mockImplementation(((fields: any) => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => {
            if (fields?.slug) {
              return Promise.resolve([
                {
                  id: 'c9999999-9999-9999-9999-999999999999',
                  slug: 'static-crypto-puzzle',
                  status: 'published',
                  releaseTime: null,
                },
              ]);
            }
            if (fields?.status && !fields?.slug) return Promise.resolve([validTeam]);
            return Promise.resolve([]);
          }),
        }),
      }),
    })) as any);

    await expect(
      service.startInstance({
        slug: 'static-crypto-puzzle',
        userId: 'u-1',
        teamId: validTeam.id,
        ipAddress: '127.0.0.1',
      })
    ).rejects.toThrow('CHALLENGE_NOT_DYNAMIC');
  });
});
