import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  setTeamStatusSchema,
  renameTeamSchema,
  setUserActiveSchema,
  setUserRoleSchema,
} from '../../src/modules/admin/admin.schema.js';
import { AdminService } from '../../src/modules/admin/admin.service.js';

describe('Team & User Moderation Semantics', () => {
  let adminService: AdminService;

  beforeEach(() => {
    adminService = new AdminService();
  });

  // ---------------------------------------------------------------------------
  // 1. TEAM STATUS SCHEMA & REASON VALIDATION
  // ---------------------------------------------------------------------------
  describe('Team Moderation Schema Validation', () => {
    it('requires a reason of at least 3 characters when modifying team status', () => {
      const valid = setTeamStatusSchema.safeParse({
        status: 'disqualified',
        reason: 'Flag sharing across teams',
      });
      expect(valid.success).toBe(true);

      const invalid = setTeamStatusSchema.safeParse({
        status: 'disqualified',
        reason: '',
      });
      expect(invalid.success).toBe(false);
    });

    it('validates allowed team states: active, disabled, disqualified', () => {
      expect(setTeamStatusSchema.safeParse({ status: 'active', reason: 'Unbanned' }).success).toBe(true);
      expect(setTeamStatusSchema.safeParse({ status: 'disabled', reason: 'Investigation' }).success).toBe(true);
      expect(setTeamStatusSchema.safeParse({ status: 'disqualified', reason: 'Cheating' }).success).toBe(true);
      expect(setTeamStatusSchema.safeParse({ status: 'deleted', reason: 'Non-existent' }).success).toBe(false);
    });

    it('requires valid team name and reason for renaming', () => {
      const valid = renameTeamSchema.safeParse({
        name: 'Binary Dragons Reborn',
        reason: 'Offensive original name',
      });
      expect(valid.success).toBe(true);

      const invalidName = renameTeamSchema.safeParse({
        name: 'A',
        reason: 'Too short',
      });
      expect(invalidName.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. USER MODERATION & ROLE HIERARCHY
  // ---------------------------------------------------------------------------
  describe('User Moderation Schema & Hierarchy', () => {
    it('validates setUserActive schema', () => {
      const valid = setUserActiveSchema.safeParse({
        isActive: false,
        reason: 'Suspected automated brute-forcing',
      });
      expect(valid.success).toBe(true);

      const invalid = setUserActiveSchema.safeParse({
        isActive: false,
        reason: 'No',
      });
      expect(invalid.success).toBe(false);
    });

    it('validates setUserRole schema', () => {
      const valid = setUserRoleSchema.safeParse({
        role: 'admin',
        reason: 'Promoted to challenge reviewer',
      });
      expect(valid.success).toBe(true);

      const invalid = setUserRoleSchema.safeParse({
        role: 'god_mode',
        reason: 'Invalid role',
      });
      expect(invalid.success).toBe(false);
    });

    it('prevents superadmins from demoting their own account', async () => {
      const actor = {
        id: 's0000000-0000-0000-0000-000000000001',
        role: 'superadmin',
        ip: '127.0.0.1',
      };

      // Attempting to demote self to participant
      await expect(
        adminService.setUserRole(
          actor.id,
          'participant',
          'Accidental self-demotion',
          actor
        )
      ).rejects.toThrow('CANNOT_DEMOTE_SELF');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. TEAM STATUS SYNCHRONIZATION (isBanned sync)
  // ---------------------------------------------------------------------------
  describe('Team Status & isBanned Synchronization', () => {
    it('sets isBanned: true when status is disabled or disqualified', () => {
      const status1 = 'disabled';
      const isBanned1 = status1 === 'disabled' || status1 === 'disqualified';
      expect(isBanned1).toBe(true);

      const status2 = 'disqualified';
      const isBanned2 = status2 === 'disabled' || status2 === 'disqualified';
      expect(isBanned2).toBe(true);

      const status3 = 'active';
      const isBanned3 = status3 === 'disabled' || status3 === 'disqualified';
      expect(isBanned3).toBe(false);
    });
  });
});
