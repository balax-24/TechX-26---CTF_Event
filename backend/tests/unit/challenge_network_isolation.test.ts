import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DynamicChallengesService } from '../../src/modules/dynamic_challenges/dynamic_challenges.service.js';
import { db } from '../../src/db/index.js';

describe('Stage 8: Challenge Network Isolation & Inbound Reverse Proxy Security (Zero SSRF)', () => {
  let service: DynamicChallengesService;

  const validChallenge = {
    id: 'c1111111-1111-4111-8111-111111111111',
    slug: 'intro-sqli-sandbox',
  };

  beforeEach(() => {
    service = new DynamicChallengesService();
    vi.restoreAllMocks();
  });

  it('resolves proxy upstream strictly from authenticated database record, ignoring user-supplied targets', async () => {
    vi.spyOn(db, 'select').mockImplementation(((fields: any) => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => {
            if (fields?.id && !fields?.internalIp) return Promise.resolve([validChallenge]);
            return Promise.resolve([
              {
                id: 'inst-1',
                challengeId: validChallenge.id,
                teamId: 'team-authorized',
                status: 'RUNNING',
                internalIp: '172.28.0.45',
                internalPort: 8080,
                expiresAt: new Date(Date.now() + 600000),
              },
            ]);
          }),
        }),
      }),
    })) as any);

    const target = await service.getProxyTarget({
      slug: 'intro-sqli-sandbox',
      teamId: 'team-authorized',
    });

    expect(target.internalIp).toBe('172.28.0.45');
    expect(target.internalPort).toBe(8080);
  });

  it('prohibits routing to non-running or stopped instances', async () => {
    vi.spyOn(db, 'select').mockImplementation(((fields: any) => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => {
            if (fields?.id) return Promise.resolve([validChallenge]);
            return Promise.resolve([]); // No running instance
          }),
        }),
      }),
    })) as any);

    await expect(
      service.getProxyTarget({
        slug: 'intro-sqli-sandbox',
        teamId: 'team-authorized',
      })
    ).rejects.toThrow('INSTANCE_NOT_RUNNING');
  });

  it('rejects routing if instance has passed its expiration time', async () => {
    vi.spyOn(db, 'select').mockImplementation(((fields: any) => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => {
            if (fields?.id && !fields?.internalIp) return Promise.resolve([validChallenge]);
            return Promise.resolve([
              {
                id: 'inst-expired',
                challengeId: validChallenge.id,
                teamId: 'team-authorized',
                status: 'RUNNING',
                internalIp: '172.28.0.45',
                internalPort: 8080,
                expiresAt: new Date(Date.now() - 5000), // Expired
              },
            ]);
          }),
        }),
      }),
    })) as any);

    vi.spyOn(service, 'expireInstance').mockResolvedValue(undefined);

    await expect(
      service.getProxyTarget({
        slug: 'intro-sqli-sandbox',
        teamId: 'team-authorized',
      })
    ).rejects.toThrow('INSTANCE_EXPIRED');
  });
});
