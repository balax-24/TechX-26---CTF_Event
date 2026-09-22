import { eq, sql, count } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { teams, teamMembers, users } from '../../db/schema.js';
import { generateInviteCode, hashInviteCode } from '../../utils/crypto.js';
import { config } from '../../config/env.js';
import { CreateTeamInput, JoinTeamInput } from './teams.schema.js';

export interface TeamMemberProfile {
  userId: string;
  username: string;
  email?: string;
  role: 'captain' | 'member';
  joinedAt: Date;
}

export interface TeamDetailResult {
  id: string;
  name: string;
  captainId: string;
  score: number;
  isBanned: boolean;
  createdAt: Date;
  inviteCode?: string;
  members: TeamMemberProfile[];
}

export class TeamsService {
  /**
   * Creates a new team with the caller as Captain within an atomic transaction.
   */
  async createTeam(userId: string, input: CreateTeamInput): Promise<{ team: TeamDetailResult; inviteCode: string }> {
    // 1. Verify user is not already in a team
    const [existingMember] = await db
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(eq(teamMembers.userId, userId))
      .limit(1);

    if (existingMember) {
      throw new Error('ALREADY_IN_TEAM');
    }

    // 2. Check team name uniqueness
    const [existingTeam] = await db
      .select({ id: teams.id })
      .from(teams)
      .where(sql`LOWER(${teams.name}) = LOWER(${input.name})`)
      .limit(1);

    if (existingTeam) {
      throw new Error('TEAM_NAME_EXISTS');
    }

    const rawInviteCode = generateInviteCode();
    const inviteHash = hashInviteCode(rawInviteCode);

    // 3. Atomic transaction: create team and add captain member
    return await db.transaction(async (tx) => {
      const [newTeam] = await tx
        .insert(teams)
        .values({
          name: input.name,
          inviteCodeHash: inviteHash,
          captainId: userId,
          score: 0,
        })
        .returning();

      await tx.insert(teamMembers).values({
        teamId: newTeam.id,
        userId,
        role: 'captain',
      });

      const [user] = await tx
        .select({ username: users.username, email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      return {
        team: {
          id: newTeam.id,
          name: newTeam.name,
          captainId: newTeam.captainId,
          score: newTeam.score,
          isBanned: newTeam.isBanned,
          createdAt: newTeam.createdAt,
          inviteCode: rawInviteCode,
          members: [
            {
              userId,
              username: user.username,
              email: user.email,
              role: 'captain',
              joinedAt: new Date(),
            },
          ],
        },
        inviteCode: rawInviteCode,
      };
    });
  }

  /**
   * Joins an existing team via invite code with concurrency check on member cap.
   */
  async joinTeam(userId: string, input: JoinTeamInput): Promise<TeamDetailResult> {
    // 1. Check if user is already in a team
    const [existingMember] = await db
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(eq(teamMembers.userId, userId))
      .limit(1);

    if (existingMember) {
      throw new Error('ALREADY_IN_TEAM');
    }

    const inviteHash = hashInviteCode(input.inviteCode);

    return await db.transaction(async (tx) => {
      // 2. Find team by invite code hash (row-locked for concurrency)
      const [targetTeam] = await tx
        .select()
        .from(teams)
        .where(eq(teams.inviteCodeHash, inviteHash))
        .for('update')
        .limit(1);

      if (!targetTeam) {
        throw new Error('INVALID_INVITE_CODE');
      }

      if (targetTeam.isBanned) {
        throw new Error('TEAM_BANNED');
      }

      // 3. Check membership capacity
      const [memberCountResult] = await tx
        .select({ count: count() })
        .from(teamMembers)
        .where(eq(teamMembers.teamId, targetTeam.id));

      if (memberCountResult.count >= config.TEAM_MAX_MEMBERS) {
        throw new Error('TEAM_FULL');
      }

      // 4. Insert new member
      await tx.insert(teamMembers).values({
        teamId: targetTeam.id,
        userId,
        role: 'member',
      });

      // 5. Fetch updated roster
      const members = await tx
        .select({
          userId: teamMembers.userId,
          username: users.username,
          role: teamMembers.role,
          joinedAt: teamMembers.joinedAt,
        })
        .from(teamMembers)
        .innerJoin(users, eq(teamMembers.userId, users.id))
        .where(eq(teamMembers.teamId, targetTeam.id));

      return {
        id: targetTeam.id,
        name: targetTeam.name,
        captainId: targetTeam.captainId,
        score: targetTeam.score,
        isBanned: targetTeam.isBanned,
        createdAt: targetTeam.createdAt,
        members: members.map((m) => ({
          userId: m.userId,
          username: m.username,
          role: m.role as 'captain' | 'member',
          joinedAt: m.joinedAt,
        })),
      };
    });
  }

  /**
   * Retrieves full team roster.
   * If isMemberOrAdmin is false, private details (like emails) are stripped.
   */
  async getTeamDetails(teamId: string, isMemberOrAdmin: boolean): Promise<TeamDetailResult | null> {
    const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
    if (!team) return null;

    const rawMembers = await db
      .select({
        userId: teamMembers.userId,
        username: users.username,
        email: users.email,
        role: teamMembers.role,
        joinedAt: teamMembers.joinedAt,
      })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .where(eq(teamMembers.teamId, teamId));

    return {
      id: team.id,
      name: team.name,
      captainId: team.captainId,
      score: team.score,
      isBanned: team.isBanned,
      createdAt: team.createdAt,
      members: rawMembers.map((m) => ({
        userId: m.userId,
        username: m.username,
        email: isMemberOrAdmin ? m.email : undefined,
        role: m.role as 'captain' | 'member',
        joinedAt: m.joinedAt,
      })),
    };
  }

  /**
   * Leaves current team. If captain is the sole member, the team is deleted.
   */
  async leaveTeam(userId: string, teamId: string): Promise<{ disbanded: boolean }> {
    return await db.transaction(async (tx) => {
      const [membership] = await tx
        .select()
        .from(teamMembers)
        .where(sql`${teamMembers.teamId} = ${teamId} AND ${teamMembers.userId} = ${userId}`)
        .limit(1);

      if (!membership) {
        throw new Error('NOT_IN_TEAM');
      }

      const [memberCountResult] = await tx
        .select({ count: count() })
        .from(teamMembers)
        .where(eq(teamMembers.teamId, teamId));

      if (membership.role === 'captain') {
        if (memberCountResult.count > 1) {
          throw new Error('CAPTAIN_CANNOT_LEAVE');
        }
        // Lone captain leaving: disband team
        await tx.delete(teams).where(eq(teams.id, teamId));
        return { disbanded: true };
      }

      // Ordinary member leaving
      await tx.delete(teamMembers).where(eq(teamMembers.id, membership.id));
      return { disbanded: false };
    });
  }

  /**
   * Returns a paginated list of public team summaries.
   */
  async listTeams(limit = 50, offset = 0) {
    const teamList = await db
      .select({
        id: teams.id,
        name: teams.name,
        score: teams.score,
        createdAt: teams.createdAt,
      })
      .from(teams)
      .where(eq(teams.isBanned, false))
      .limit(limit)
      .offset(offset);

    return teamList;
  }
}

export const teamsService = new TeamsService();
