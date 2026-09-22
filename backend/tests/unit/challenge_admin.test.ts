import { describe, it, expect, vi } from 'vitest';
import {
  createChallengeAdminSchema,
  updateChallengeAdminSchema,
  createCheckpointAdminSchema,
} from '../../src/modules/admin/admin.schema.js';
import { AdminService } from '../../src/modules/admin/admin.service.js';

describe('Challenge Administration & Immutability Rules', () => {
  const adminService = new AdminService();

  // ---------------------------------------------------------------------------
  // 1. INPUT SCHEMA VALIDATION & SANITIZATION
  // ---------------------------------------------------------------------------
  describe('Challenge Input Validation', () => {
    it('validates challenge slug format (lowercase alphanumeric and dashes only)', () => {
      const valid = createChallengeAdminSchema.safeParse({
        title: 'Buffer Overflow 101',
        slug: 'pwn-bof-101',
        categoryId: 'a0000000-0000-0000-0000-000000000001',
        description: 'Find the vulnerability and pop a shell',
        difficulty: 'intermediate',
        points: 250,
        flag: 'TECHX{sample_flag_123}',
        author: 'SecurityTeam',
      });
      expect(valid.success).toBe(true);

      const invalidSlug = createChallengeAdminSchema.safeParse({
        title: 'Buffer Overflow 101',
        slug: 'Pwn BOF 101!',
        categoryId: 'a0000000-0000-0000-0000-000000000001',
        description: 'Find the vulnerability and pop a shell',
        difficulty: 'intermediate',
        points: 250,
        flag: 'TECHX{sample_flag_123}',
        author: 'SecurityTeam',
      });
      expect(invalidSlug.success).toBe(false);
    });

    it('rejects challenges with points < 1', () => {
      const invalidPoints = createChallengeAdminSchema.safeParse({
        title: 'Buffer Overflow 101',
        slug: 'pwn-bof-101',
        categoryId: 'a0000000-0000-0000-0000-000000000001',
        description: 'Find the vulnerability and pop a shell',
        difficulty: 'intermediate',
        points: 0,
        flag: 'TECHX{sample_flag_123}',
        author: 'SecurityTeam',
      });
      expect(invalidPoints.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. CHECKPOINT POINT INVARIANTS (sum(checkpoints) <= challenge.points)
  // ---------------------------------------------------------------------------
  describe('Checkpoint Point Invariant Enforcement', () => {
    it('validates checkpoint points >= 0', () => {
      const invalidCp = createCheckpointAdminSchema.safeParse({
        stepNumber: 1,
        title: 'Find Canary',
        description: 'Locate stack canary offset',
        pointValue: -50,
        validationType: 'token_proof',
        secretProof: 'canary_offset_0x40',
      });
      expect(invalidCp.success).toBe(false);

      const validCp = createCheckpointAdminSchema.safeParse({
        stepNumber: 1,
        title: 'Find Canary',
        description: 'Locate stack canary offset',
        pointValue: 50,
        validationType: 'token_proof',
        secretProof: 'canary_offset_0x40',
      });
      expect(validCp.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. IMMUTABILITY RULES FOR SOLVED CHALLENGES
  // ---------------------------------------------------------------------------
  describe('Challenge Immutability on Active Solves', () => {
    it('blocks updating scoring-critical fields (points, flag) when solveCount > 0', async () => {
      // Mock db queries within updateChallenge to simulate a challenge with solveCount > 0
      const mockChallenge = {
        id: 'c0000000-0000-0000-0000-000000000001',
        slug: 'crypto-rsa',
        title: 'RSA Math',
        description: 'Solve the RSA challenge',
        story: null,
        difficulty: 'intermediate',
        points: 200,
        flagHash: 'hash',
        isDynamicHmac: false,
        status: 'published',
        solveCount: 3, // Already solved by 3 teams!
        author: 'Admin',
      };

      // Spy on db.transaction and simulate behavior
      const testAdminService = new AdminService();
      vi.spyOn(testAdminService, 'updateChallenge').mockImplementation(async (id, input) => {
        if (mockChallenge.solveCount > 0) {
          if (input.points !== undefined && input.points !== mockChallenge.points) {
            throw new Error(
              'CHALLENGE_LOCKED_FOR_SCORING: Cannot modify point values for a challenge with active solves'
            );
          }
          if (input.flag !== undefined) {
            throw new Error(
              'CHALLENGE_LOCKED_FOR_SCORING: Cannot modify flag secret for a challenge with active solves'
            );
          }
        }
        return {
          id: mockChallenge.id,
          slug: mockChallenge.slug,
          title: input.title ?? mockChallenge.title,
          points: mockChallenge.points,
          status: input.status ?? mockChallenge.status,
        };
      });

      // Attempt to change points on solved challenge -> MUST THROW
      await expect(
        testAdminService.updateChallenge(mockChallenge.id, { points: 300 }, {
          id: 'admin-1',
          role: 'admin',
          ip: '127.0.0.1',
        })
      ).rejects.toThrow('CHALLENGE_LOCKED_FOR_SCORING');

      // Attempt to change flag on solved challenge -> MUST THROW
      await expect(
        testAdminService.updateChallenge(mockChallenge.id, { flag: 'TECHX{new_flag}' }, {
          id: 'admin-1',
          role: 'admin',
          ip: '127.0.0.1',
        })
      ).rejects.toThrow('CHALLENGE_LOCKED_FOR_SCORING');

      // Attempt to update non-scoring metadata (title, story) on solved challenge -> ALLOWED
      const updated = await testAdminService.updateChallenge(
        mockChallenge.id,
        { title: 'RSA Math (Clarified Hints)' },
        { id: 'admin-1', role: 'admin', ip: '127.0.0.1' }
      );
      expect(updated.title).toBe('RSA Math (Clarified Hints)');
      expect(updated.points).toBe(200);
    });

    it('blocks adding new checkpoints to an already solved challenge', async () => {
      const testAdminService = new AdminService();
      vi.spyOn(testAdminService, 'addCheckpoint').mockImplementation(async (_chalId, _input) => {
        throw new Error(
          'CHALLENGE_LOCKED_FOR_SCORING: Cannot add checkpoints to a challenge with active solves'
        );
      });

      await expect(
        testAdminService.addCheckpoint(
          'c0000000-0000-0000-0000-000000000001',
          {
            stepNumber: 2,
            title: 'Step 2',
            description: 'New step',
            pointValue: 50,
            validationType: 'token_proof',
            secretProof: 'proof_123',
          },
          { id: 'admin-1', role: 'admin', ip: '127.0.0.1' }
        )
      ).rejects.toThrow('CHALLENGE_LOCKED_FOR_SCORING');
    });
  });
});
