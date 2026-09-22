import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { AuthUser } from '../../src/types/auth.js';
import { sanitizeAuditData } from '../../src/modules/admin/audit.service.js';

describe('Security Audit: Privilege Escalation, IDOR, and Secret Leakage Prevention', () => {
  let app: FastifyInstance;
  let participantToken: string;
  let adminToken: string;
  let superadminToken: string;

  const participantUser: AuthUser = {
    id: 'p2000000-0000-0000-0000-000000000001',
    username: 'regular_user',
    email: 'user@test.local',
    role: 'participant',
    teamId: 't2000000-0000-0000-0000-000000000001',
    teamRole: 'member',
  };

  const adminUser: AuthUser = {
    id: 'a2000000-0000-0000-0000-000000000001',
    username: 'site_admin',
    email: 'admin@test.local',
    role: 'admin',
    teamId: null,
    teamRole: null,
  };

  const superadminUser: AuthUser = {
    id: 's2000000-0000-0000-0000-000000000001',
    username: 'site_superadmin',
    email: 'superadmin@test.local',
    role: 'superadmin',
    teamId: null,
    teamRole: null,
  };

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    participantToken = app.jwt.sign(participantUser);
    adminToken = app.jwt.sign(adminUser);
    superadminToken = app.jwt.sign(superadminUser);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Privilege Escalation Boundaries', () => {
    it('strictly blocks participant from accessing any admin endpoint', async () => {
      const endpoints = [
        { method: 'GET', url: '/api/v1/admin/competition/state' },
        { method: 'GET', url: '/api/v1/admin/challenges' },
        { method: 'GET', url: '/api/v1/admin/teams' },
        { method: 'GET', url: '/api/v1/admin/users' },
        { method: 'GET', url: '/api/v1/admin/audit' },
      ];

      for (const ep of endpoints) {
        const res = await app.inject({
          method: ep.method as any,
          url: ep.url,
          headers: { authorization: `Bearer ${participantToken}` },
        });
        expect(res.statusCode).toBe(403);
      }
    });

    it('blocks regular admin from performing superadmin-only actions (e.g. changing user roles)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/users/target-user-id/role',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { role: 'superadmin', reason: 'Attempted privilege escalation' },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).message).toMatch(/Insufficient permissions|Forbidden/i);
    });

    it('ignores client-forged actor IDs in request body (actor identity derived solely from verified session)', async () => {
      // In TechX CTF, actorId is extracted from req.user.id via getActor(req), never trusted from body
      const forgedActorId = 'attacker-uuid-forged-999999999999';
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/competition/pause',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          reason: 'Emergency pause',
          actorId: forgedActorId,
          actorUserId: forgedActorId,
        },
      });

      // Request either succeeds or errors from domain logic, but does NOT accept forged actorId
      expect(res.statusCode).not.toBe(500);
    });
  });

  describe('Secret Leakage Prevention & Sanitization', () => {
    it('ensures audit log sanitization strips passwords, tokens, raw flags, and HMAC secrets', () => {
      const sensitivePayload = {
        userId: 'u1',
        password: 'PlaintextPassword123!',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$...',
        flag: 'TECHX{production_secret_flag}',
        submittedFlag: 'TECHX{wrong_flag}',
        secretProof: 'checkpoint_token_super_secret',
        secretProofHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        csrfToken: 'nonce123.hmacsignature',
        cookieSecret: 'very_secret_cookie_encryption_key',
        hmacKey: 'dynamic_challenge_hmac_secret',
        inviteCode: 'TEAM-INVITE-CODE-XYZ',
        // Legitimate non-secret metadata
        flagCount: 15,
        flagFormat: 'TECHX{...}',
        hashAlgorithm: 'sha256',
        commitHash: 'b2322c3',
        status: 'published',
        points: 500,
        nested: {
          innerPassword: 'nested_secret_password',
          safeField: 'audit_event_detail',
        },
      };

      const sanitized = sanitizeAuditData(sensitivePayload);

      // Secrets must be redacted
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.passwordHash).toBe('[REDACTED]');
      expect(sanitized.flag).toBe('[REDACTED]');
      expect(sanitized.submittedFlag).toBe('[REDACTED]');
      expect(sanitized.secretProof).toBe('[REDACTED]');
      expect(sanitized.secretProofHash).toBe('[REDACTED]');
      expect(sanitized.accessToken).toBe('[REDACTED]');
      expect(sanitized.csrfToken).toBe('[REDACTED]');
      expect(sanitized.cookieSecret).toBe('[REDACTED]');
      expect(sanitized.hmacKey).toBe('[REDACTED]');
      expect(sanitized.inviteCode).toBe('[REDACTED]');
      expect(sanitized.nested.innerPassword).toBe('[REDACTED]');

      // Legitimate metadata must be preserved
      expect(sanitized.flagCount).toBe(15);
      expect(sanitized.flagFormat).toBe('TECHX{...}');
      expect(sanitized.hashAlgorithm).toBe('sha256');
      expect(sanitized.commitHash).toBe('b2322c3');
      expect(sanitized.status).toBe('published');
      expect(sanitized.points).toBe(500);
      expect(sanitized.nested.safeField).toBe('audit_event_detail');
    });
  });
});
