import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { AuthUser } from '../../src/types/auth.js';
import { generateCsrfToken } from '../../src/middleware/csrf.middleware.js';
import { hashPassword, verifyPassword } from '../../src/utils/crypto.js';
import {
  createTeamAdminSchema,
  addTeamMemberAdminSchema,
  createParticipantAdminSchema,
  resetPasswordAdminSchema,
  patchUserAdminSchema,
} from '../../src/modules/admin/admin.schema.js';

describe('Stage 13 Participant Auth Deprecation & Admin Provisioning Security', () => {
  let app: FastifyInstance;
  let participantToken: string;
  let adminToken: string;
  let adminCsrfToken: string;
  const adminId = 'a0000000-0000-0000-0000-000000000099';
  const participantId = 'p0000000-0000-0000-0000-000000000099';

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const participant: AuthUser = {
      id: participantId,
      username: 'participant_zero',
      email: 'pzero@techxmadras.org',
      role: 'participant',
      teamId: 't0000000-0000-0000-0000-000000000099',
      teamRole: 'member',
    };
    participantToken = app.jwt.sign(participant);

    const admin: AuthUser = {
      id: adminId,
      username: 'admin_master',
      email: 'admin@techxmadras.org',
      role: 'admin',
      teamId: null,
      teamRole: null,
    };
    adminToken = app.jwt.sign(admin);
    adminCsrfToken = generateCsrfToken(adminId);
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // 1. PUBLIC REGISTRATION & SELF-SERVICE DEPRECATION
  // ---------------------------------------------------------------------------
  describe('Public Self-Registration & Self-Service Deprecation', () => {
    it('rejects POST /api/v1/auth/register with 403 Forbidden and PUBLIC_REGISTRATION_DISABLED', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          username: 'self_registered_user',
          email: 'selfreg@test.local',
          password: 'Password123!',
        },
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('PUBLIC_REGISTRATION_DISABLED');
      expect(body.message).toContain('Public registration is disabled');
    });

    it('rejects self-service team creation POST /api/v1/teams with 403 Forbidden', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/teams',
        headers: {
          authorization: `Bearer ${participantToken}`,
          'x-csrf-token': generateCsrfToken(participantId),
        },
        payload: { name: 'RogueTeam' },
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('TEAM_CREATION_DISABLED');
    });

    it('rejects self-service team join POST /api/v1/teams/join with 403 Forbidden when authenticated', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/teams/join',
        headers: {
          authorization: `Bearer ${participantToken}`,
          'x-csrf-token': generateCsrfToken(participantId),
        },
        payload: { inviteCode: 'TECHX-AAAA-BBBB' },
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('TEAM_JOIN_DISABLED');
    });

    it('rejects self-service team leave POST /api/v1/teams/leave with 403 Forbidden', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/teams/leave',
        headers: {
          authorization: `Bearer ${participantToken}`,
          'x-csrf-token': generateCsrfToken(participantId),
        },
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('TEAM_LEAVE_DISABLED');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. PARTICIPANT RBAC ENFORCEMENT ON ADMIN PROVISIONING ENDPOINTS
  // ---------------------------------------------------------------------------
  describe('RBAC Isolation: Participants Blocked From Admin Provisioning', () => {
    it('blocks participant from POST /api/v1/admin/teams with 403 Forbidden', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/teams',
        headers: {
          authorization: `Bearer ${participantToken}`,
          'x-csrf-token': generateCsrfToken(participantId),
        },
        payload: { name: 'AdminHackedTeam' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('blocks participant from POST /api/v1/admin/teams/:id/members with 403 Forbidden', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/teams/t0000000-0000-0000-0000-000000000001/members',
        headers: {
          authorization: `Bearer ${participantToken}`,
          'x-csrf-token': generateCsrfToken(participantId),
        },
        payload: { userId: participantId, role: 'captain' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('blocks participant from DELETE /api/v1/admin/teams/:id/members/:userId with 403 Forbidden', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/teams/t0000000-0000-0000-0000-000000000001/members/${participantId}`,
        headers: {
          authorization: `Bearer ${participantToken}`,
          'x-csrf-token': generateCsrfToken(participantId),
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it('blocks participant from POST /api/v1/admin/users with 403 Forbidden', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/users',
        headers: {
          authorization: `Bearer ${participantToken}`,
          'x-csrf-token': generateCsrfToken(participantId),
        },
        payload: {
          username: 'fake_user',
          email: 'fake@techx.org',
          password: 'Password123!',
          teamId: 't0000000-0000-0000-0000-000000000001',
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it('blocks participant from POST /api/v1/admin/users/:id/reset-password with 403 Forbidden', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/users/${participantId}/reset-password`,
        headers: {
          authorization: `Bearer ${participantToken}`,
          'x-csrf-token': generateCsrfToken(participantId),
        },
        payload: { password: 'NewPassword123!', reason: 'Hacking password' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. CSRF INTEGRITY ON PROVISIONING ENDPOINTS
  // ---------------------------------------------------------------------------
  describe('CSRF Integrity on Admin Provisioning', () => {
    it('rejects POST /api/v1/admin/teams with cookie session but missing CSRF token with 403', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/teams',
        cookies: {
          access_token: adminToken,
        },
        payload: { name: 'ValidTeam' },
      });
      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.payload);
      expect(body.message).toContain('CSRF_REQUIRED');
    });

    it('rejects POST /api/v1/admin/users with cookie session but missing CSRF token with 403', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/users',
        cookies: {
          access_token: adminToken,
        },
        payload: {
          username: 'valid_user',
          email: 'valid@techx.org',
          password: 'Password123!',
          teamId: 'b0000000-0000-0000-0000-000000000001',
        },
      });
      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.payload);
      expect(body.message).toContain('CSRF_REQUIRED');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. ADMIN PROVISIONING INPUT VALIDATION SCHEMAS
  // ---------------------------------------------------------------------------
  describe('Admin Provisioning Schemas & Password Security', () => {
    it('validates createTeamAdminSchema: rejects empty or short team names', () => {
      const emptyResult = createTeamAdminSchema.safeParse({ name: ' ' });
      expect(emptyResult.success).toBe(false);

      const validResult = createTeamAdminSchema.safeParse({ name: 'Team Alpha' });
      expect(validResult.success).toBe(true);
    });

    it('validates addTeamMemberAdminSchema: requires valid UUID and role', () => {
      const invalidUuid = addTeamMemberAdminSchema.safeParse({
        userId: 'not-a-uuid',
        role: 'member',
      });
      expect(invalidUuid.success).toBe(false);

      const valid = addTeamMemberAdminSchema.safeParse({
        userId: 'a0000000-0000-0000-0000-000000000001',
        role: 'captain',
      });
      expect(valid.success).toBe(true);
    });

    it('validates createParticipantAdminSchema: rejects passwords under 8 characters', () => {
      const shortPass = createParticipantAdminSchema.safeParse({
        username: 'validuser',
        email: 'user@techx.org',
        password: 'short', // < 8
        teamId: 'b0000000-0000-0000-0000-000000000001',
      });
      expect(shortPass.success).toBe(false);

      const valid = createParticipantAdminSchema.safeParse({
        username: 'validuser',
        email: 'user@techx.org',
        password: 'SecurePassword123!',
        teamId: 'b0000000-0000-0000-0000-000000000001',
        roleInTeam: 'member',
      });
      expect(valid.success).toBe(true);
    });

    it('validates resetPasswordAdminSchema: requires at least 8 chars and reason', () => {
      const noReason = resetPasswordAdminSchema.safeParse({
        password: 'NewSecurePassword123!',
        reason: 'ab', // < 3
      });
      expect(noReason.success).toBe(false);

      const valid = resetPasswordAdminSchema.safeParse({
        password: 'NewSecurePassword123!',
        reason: 'Provisioned temporary password for participant',
      });
      expect(valid.success).toBe(true);
    });

    it('validates patchUserAdminSchema: handles optional username and email', () => {
      const invalidEmail = patchUserAdminSchema.safeParse({
        email: 'not-an-email',
        reason: 'Email update',
      });
      expect(invalidEmail.success).toBe(false);

      const valid = patchUserAdminSchema.safeParse({
        username: 'renamed_user',
        isActive: false,
        reason: 'Account disabled pending inquiry',
      });
      expect(valid.success).toBe(true);
    });

    it('hashes passwords with Argon2id and verifies securely without leaking plaintext', async () => {
      const plainPassword = 'SuperSecretCompetitionPassword2026!';
      const hash = await hashPassword(plainPassword);

      expect(hash).toContain('$argon2id$');
      expect(hash).not.toContain(plainPassword);

      const matches = await verifyPassword(hash, plainPassword);
      expect(matches).toBe(true);

      const wrongMatches = await verifyPassword(hash, 'WrongPassword123!');
      expect(wrongMatches).toBe(false);
    });
  });
});
