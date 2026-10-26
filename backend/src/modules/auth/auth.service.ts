import { eq, or, and, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { users, teams, teamMembers, auditLogs } from '../../db/schema.js';
import { hashPassword, verifyPassword } from '../../utils/crypto.js';
import { RegisterInput, LoginInput } from './auth.schema.js';
import { UserRole } from '../../types/auth.js';
import { getRedisClient } from '../../cache/redis.js';

export interface UserAuthResult {
  user: {
    id: string;
    username: string;
    email: string;
    role: UserRole;
    createdAt: Date;
    mustChangePassword?: boolean;
  };
  team: {
    id: string;
    name: string;
    role: 'captain' | 'member';
  } | null;
}

export class AuthService {
  /**
   * Helper to determine if an admin user is flagged for first-login password change.
   */
  async checkMustChangePassword(userId: string, email: string): Promise<boolean> {
    try {
      const redis = getRedisClient();
      const flag = await redis.get(`user:must_change_password:${userId}`);
      if (flag === '1') {
        return true;
      }
    } catch {}

    // For bootstrap admin, check if they have ever performed a password_change audit log
    const bootstrapEmail = (process.env.ADMIN_BOOTSTRAP_EMAIL || process.env.ADMIN_EMAIL || '').toLowerCase().trim();
    if (bootstrapEmail && email.toLowerCase().trim() === bootstrapEmail) {
      try {
        const [pwdChange] = await db
          .select({ id: auditLogs.id })
          .from(auditLogs)
          .where(and(eq(auditLogs.entityId, userId), eq(auditLogs.action, 'password_change')))
          .limit(1);
        if (!pwdChange) {
          try {
            const redis = getRedisClient();
            await redis.set(`user:must_change_password:${userId}`, '1');
          } catch {}
          return true;
        }
      } catch {}
    }

    return false;
  }

  /**
   * Registers a new user account.
   */
  async register(input: RegisterInput): Promise<UserAuthResult> {
    const existing = await db
      .select({ id: users.id, username: users.username, email: users.email })
      .from(users)
      .where(or(eq(users.username, input.username.trim()), eq(users.email, input.email.trim().toLowerCase())))
      .limit(1);

    if (existing.length > 0) {
      if (existing[0].username.toLowerCase() === input.username.trim().toLowerCase()) {
        throw new Error('USERNAME_EXISTS');
      }
      throw new Error('EMAIL_EXISTS');
    }

    const passwordHash = await hashPassword(input.password);

    const [newUser] = await db
      .insert(users)
      .values({
        username: input.username.trim(),
        email: input.email.trim().toLowerCase(),
        passwordHash,
        role: 'participant',
      })
      .returning({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
      });

    return {
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role as UserRole,
        createdAt: newUser.createdAt,
        mustChangePassword: false,
      },
      team: null,
    };
  }

  /**
   * Authenticates user credentials and resolves team membership.
   */
  async login(input: LoginInput): Promise<UserAuthResult | null> {
    const normalizedIdentifier = input.identifier.trim();

    let [foundUser] = await db
      .select()
      .from(users)
      .where(
        or(
          sql`LOWER(${users.username}) = LOWER(${normalizedIdentifier})`,
          eq(users.email, normalizedIdentifier.toLowerCase())
        )
      )
      .limit(1);

    // If participant entered their team name instead of username/email, resolve team captain
    if (!foundUser) {
      const [teamMatch] = await db
        .select({
          captainId: teams.captainId,
        })
        .from(teams)
        .where(sql`LOWER(${teams.name}) = LOWER(${normalizedIdentifier})`)
        .limit(1);

      if (teamMatch?.captainId) {
        const [captainUser] = await db
          .select()
          .from(users)
          .where(eq(users.id, teamMatch.captainId))
          .limit(1);
        if (captainUser) {
          foundUser = captainUser;
        }
      }
    }

    if (!foundUser || !foundUser.isActive) {
      return null;
    }

    const isValid = await verifyPassword(foundUser.passwordHash, input.password);
    if (!isValid) {
      return null;
    }

    // Resolve team affiliation
    const [membership] = await db
      .select({
        teamId: teams.id,
        teamName: teams.name,
        role: teamMembers.role,
        teamStatus: teams.status,
        teamIsBanned: teams.isBanned,
      })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(eq(teamMembers.userId, foundUser.id))
      .limit(1);

    // Participant login enforcement:
    // Participants must be assigned to an active, non-banned team.
    if (foundUser.role === 'participant') {
      if (!membership) {
        return null;
      }
      if (
        membership.teamIsBanned ||
        membership.teamStatus === 'disabled' ||
        membership.teamStatus === 'disqualified'
      ) {
        return null;
      }
    }

    const mustChangePassword = await this.checkMustChangePassword(foundUser.id, foundUser.email);

    return {
      user: {
        id: foundUser.id,
        username: foundUser.username,
        email: foundUser.email,
        role: foundUser.role as UserRole,
        createdAt: foundUser.createdAt,
        mustChangePassword,
      },
      team: membership
        ? {
            id: membership.teamId,
            name: membership.teamName,
            role: membership.role as 'captain' | 'member',
          }
        : null,
    };
  }

  /**
   * Retrieves user profile and team details by user ID.
   */
  async getProfile(userId: string): Promise<UserAuthResult | null> {
    const [foundUser] = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!foundUser) {
      return null;
    }

    const [membership] = await db
      .select({
        teamId: teams.id,
        teamName: teams.name,
        role: teamMembers.role,
      })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(eq(teamMembers.userId, foundUser.id))
      .limit(1);

    const mustChangePassword = await this.checkMustChangePassword(foundUser.id, foundUser.email);

    return {
      user: {
        id: foundUser.id,
        username: foundUser.username,
        email: foundUser.email,
        role: foundUser.role as UserRole,
        createdAt: foundUser.createdAt,
        mustChangePassword,
      },
      team: membership
        ? {
            id: membership.teamId,
            name: membership.teamName,
            role: membership.role as 'captain' | 'member',
          }
        : null,
    };
  }

  /**
   * Securely changes a user's password with current password verification.
   */
  async changePassword(params: {
    userId: string;
    currentPassword: string;
    newPassword: string;
    ip: string;
  }): Promise<{ success: boolean }> {
    const [foundUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, params.userId))
      .limit(1);

    if (!foundUser || !foundUser.isActive) {
      throw new Error('USER_NOT_FOUND');
    }

    const isMatch = await verifyPassword(foundUser.passwordHash, params.currentPassword);
    if (!isMatch) {
      throw new Error('INVALID_CURRENT_PASSWORD');
    }

    if (params.newPassword.length < 8) {
      throw new Error('PASSWORD_TOO_SHORT');
    }

    if (params.currentPassword === params.newPassword) {
      throw new Error('PASSWORD_UNCHANGED');
    }

    const newHash = await hashPassword(params.newPassword);

    await db
      .update(users)
      .set({
        passwordHash: newHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, params.userId));

    // Audit log (sanitized: strictly no passwords)
    await db.insert(auditLogs).values({
      actorId: foundUser.id,
      actorRole: foundUser.role,
      actorIp: params.ip,
      action: 'password_change',
      entityType: 'user',
      entityId: foundUser.id,
      reason: 'Administrator updated account password',
      detailsJson: {
        username: foundUser.username,
        email: foundUser.email,
      },
    });

    try {
      const redis = getRedisClient();
      await redis.del(`user:must_change_password:${params.userId}`);
    } catch {}

    return { success: true };
  }
}

export const authService = new AuthService();
