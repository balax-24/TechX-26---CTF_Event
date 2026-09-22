import { eq, or } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { users, teams, teamMembers } from '../../db/schema.js';
import { hashPassword, verifyPassword } from '../../utils/crypto.js';
import { RegisterInput, LoginInput } from './auth.schema.js';
import { UserRole } from '../../types/auth.js';

export interface UserAuthResult {
  user: {
    id: string;
    username: string;
    email: string;
    role: UserRole;
    createdAt: Date;
  };
  team: {
    id: string;
    name: string;
    role: 'captain' | 'member';
  } | null;
}

export class AuthService {
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
      },
      team: null,
    };
  }

  /**
   * Authenticates user credentials and resolves team membership.
   */
  async login(input: LoginInput): Promise<UserAuthResult | null> {
    const normalizedIdentifier = input.identifier.trim();

    const [foundUser] = await db
      .select()
      .from(users)
      .where(
        or(
          eq(users.username, normalizedIdentifier),
          eq(users.email, normalizedIdentifier.toLowerCase())
        )
      )
      .limit(1);

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
      })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(eq(teamMembers.userId, foundUser.id))
      .limit(1);

    return {
      user: {
        id: foundUser.id,
        username: foundUser.username,
        email: foundUser.email,
        role: foundUser.role as UserRole,
        createdAt: foundUser.createdAt,
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

    return {
      user: {
        id: foundUser.id,
        username: foundUser.username,
        email: foundUser.email,
        role: foundUser.role as UserRole,
        createdAt: foundUser.createdAt,
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
}

export const authService = new AuthService();
