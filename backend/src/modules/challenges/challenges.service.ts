import { eq, and, sql, lte, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  challenges,
  categories,
  challengeFiles,
  checkpoints,
  checkpointProgress,
  hints,
  teamHints,
  teamSolves,
} from '../../db/schema.js';
import { ChallengeFilterInput } from './challenges.schema.js';

export interface ChallengeSummary {
  id: string;
  slug: string;
  title: string;
  category: {
    name: string;
    slug: string;
  };
  difficulty: 'beginner' | 'intermediate' | 'expert';
  points: number;
  solveCount: number;
  isSolved: boolean;
  totalCheckpoints: number;
  solvedCheckpoints: number;
}

export interface ChallengeDetail extends ChallengeSummary {
  description: string;
  story: string | null;
  author: string;
  connectionInfo: string | null;
  files: {
    id: string;
    filename: string;
    fileSizeBytes: number;
    sha256Checksum: string;
  }[];
  hints: {
    id: string;
    orderNumber: number;
    penaltyPoints: number;
    isUnlocked: boolean;
    content: string | null; // Null if not unlocked by caller's team
  }[];
  checkpoints: {
    id: string;
    stepNumber: number;
    title: string;
    description: string;
    pointValue: number;
    isSolved: boolean;
  }[];
}

export class ChallengesService {
  /**
   * Lists all published challenges with category details and caller's team solve status.
   */
  async listChallenges(
    filter: ChallengeFilterInput,
    teamId?: string | null,
    isAdmin: boolean = false
  ): Promise<ChallengeSummary[]> {
    const conditions = [];

    // Participants only see published challenges whose releaseTime has arrived
    if (!isAdmin) {
      conditions.push(eq(challenges.status, 'published'));
      conditions.push(
        sql`(${challenges.releaseTime} IS NULL OR ${challenges.releaseTime} <= NOW())`
      );
    }

    if (filter.difficulty) {
      conditions.push(eq(challenges.difficulty, filter.difficulty));
    }

    if (filter.category) {
      conditions.push(eq(categories.slug, filter.category));
    }

    const rows = await db
      .select({
        id: challenges.id,
        slug: challenges.slug,
        title: challenges.title,
        difficulty: challenges.difficulty,
        points: challenges.points,
        solveCount: challenges.solveCount,
        categoryName: categories.name,
        categorySlug: categories.slug,
      })
      .from(challenges)
      .innerJoin(categories, eq(challenges.categoryId, categories.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(challenges.points, challenges.title);

    // Fetch team solves and checkpoint counts in batch if teamId is available
    const solvedChallengeIds = new Set<string>();
    const teamSolvedCheckpoints = new Map<string, number>();

    if (teamId && rows.length > 0) {
      const challengeIds = rows.map((r) => r.id);

      const solves = await db
        .select({ challengeId: teamSolves.challengeId })
        .from(teamSolves)
        .where(
          and(
            eq(teamSolves.teamId, teamId),
            inArray(teamSolves.challengeId, challengeIds)
          )
        );
      solves.forEach((s) => solvedChallengeIds.add(s.challengeId));

      const cpProgress = await db
        .select({
          challengeId: checkpoints.challengeId,
          count: sql<number>`count(*)::int`,
        })
        .from(checkpointProgress)
        .innerJoin(checkpoints, eq(checkpointProgress.checkpointId, checkpoints.id))
        .where(
          and(
            eq(checkpointProgress.teamId, teamId),
            inArray(checkpoints.challengeId, challengeIds)
          )
        )
        .groupBy(checkpoints.challengeId);

      cpProgress.forEach((cp) => teamSolvedCheckpoints.set(cp.challengeId, cp.count));
    }

    // Get total checkpoint counts per challenge
    const allCheckpoints = await db
      .select({
        challengeId: checkpoints.challengeId,
        count: sql<number>`count(*)::int`,
      })
      .from(checkpoints)
      .groupBy(checkpoints.challengeId);

    const totalCheckpointsMap = new Map<string, number>();
    allCheckpoints.forEach((cp) => totalCheckpointsMap.set(cp.challengeId, cp.count));

    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      category: {
        name: r.categoryName,
        slug: r.categorySlug,
      },
      difficulty: r.difficulty as 'beginner' | 'intermediate' | 'expert',
      points: r.points,
      solveCount: r.solveCount,
      isSolved: solvedChallengeIds.has(r.id),
      totalCheckpoints: totalCheckpointsMap.get(r.id) || 0,
      solvedCheckpoints: teamSolvedCheckpoints.get(r.id) || 0,
    }));
  }

  /**
   * Retrieves full challenge details, stripping flags and locking unpurchased hints.
   */
  async getChallengeBySlug(
    slug: string,
    teamId?: string | null,
    isAdmin: boolean = false
  ): Promise<ChallengeDetail | null> {
    const conditions = [eq(challenges.slug, slug)];
    if (!isAdmin) {
      conditions.push(eq(challenges.status, 'published'));
      conditions.push(
        sql`(${challenges.releaseTime} IS NULL OR ${challenges.releaseTime} <= NOW())`
      );
    }

    const [chal] = await db
      .select({
        id: challenges.id,
        slug: challenges.slug,
        title: challenges.title,
        description: challenges.description,
        story: challenges.story,
        difficulty: challenges.difficulty,
        points: challenges.points,
        solveCount: challenges.solveCount,
        author: challenges.author,
        connectionInfo: challenges.connectionInfo,
        categoryName: categories.name,
        categorySlug: categories.slug,
      })
      .from(challenges)
      .innerJoin(categories, eq(challenges.categoryId, categories.id))
      .where(and(...conditions))
      .limit(1);

    if (!chal) return null;

    // 1. Files
    const files = await db
      .select({
        id: challengeFiles.id,
        filename: challengeFiles.filename,
        fileSizeBytes: challengeFiles.fileSizeBytes,
        sha256Checksum: challengeFiles.sha256Checksum,
      })
      .from(challengeFiles)
      .where(eq(challengeFiles.challengeId, chal.id));

    // 2. Checkpoints
    const chalCheckpoints = await db
      .select({
        id: checkpoints.id,
        stepNumber: checkpoints.stepNumber,
        title: checkpoints.title,
        description: checkpoints.description,
        pointValue: checkpoints.pointValue,
      })
      .from(checkpoints)
      .where(eq(checkpoints.challengeId, chal.id))
      .orderBy(checkpoints.stepNumber);

    // 3. Hints
    const chalHints = await db
      .select({
        id: hints.id,
        orderNumber: hints.orderNumber,
        penaltyPoints: hints.penaltyPoints,
        content: hints.content,
      })
      .from(hints)
      .where(eq(hints.challengeId, chal.id))
      .orderBy(hints.orderNumber);

    // 4. Team-specific progress (solves, unlocked hints, solved checkpoints)
    let isSolved = false;
    const unlockedHintIds = new Set<string>();
    const solvedCheckpointIds = new Set<string>();

    if (teamId) {
      const [solve] = await db
        .select({ id: teamSolves.id })
        .from(teamSolves)
        .where(
          and(
            eq(teamSolves.teamId, teamId),
            eq(teamSolves.challengeId, chal.id)
          )
        )
        .limit(1);
      isSolved = !!solve;

      const unlocked = await db
        .select({ hintId: teamHints.hintId })
        .from(teamHints)
        .where(eq(teamHints.teamId, teamId));
      unlocked.forEach((u) => unlockedHintIds.add(u.hintId));

      const solvedCps = await db
        .select({ checkpointId: checkpointProgress.checkpointId })
        .from(checkpointProgress)
        .where(eq(checkpointProgress.teamId, teamId));
      solvedCps.forEach((cp) => solvedCheckpointIds.add(cp.checkpointId));
    }

    return {
      id: chal.id,
      slug: chal.slug,
      title: chal.title,
      description: chal.description,
      story: chal.story,
      difficulty: chal.difficulty as 'beginner' | 'intermediate' | 'expert',
      points: chal.points,
      solveCount: chal.solveCount,
      author: chal.author,
      connectionInfo: chal.connectionInfo,
      category: {
        name: chal.categoryName,
        slug: chal.categorySlug,
      },
      isSolved,
      totalCheckpoints: chalCheckpoints.length,
      solvedCheckpoints: solvedCheckpointIds.size,
      files,
      hints: chalHints.map((h) => {
        const isUnlocked = unlockedHintIds.has(h.id) || isAdmin;
        return {
          id: h.id,
          orderNumber: h.orderNumber,
          penaltyPoints: h.penaltyPoints,
          isUnlocked,
          content: isUnlocked ? h.content : null, // Privacy & security guarantee
        };
      }),
      checkpoints: chalCheckpoints.map((cp) => ({
        id: cp.id,
        stepNumber: cp.stepNumber,
        title: cp.title,
        description: cp.description,
        pointValue: cp.pointValue,
        isSolved: solvedCheckpointIds.has(cp.id),
      })),
    };
  }

  /**
   * Retrieves challenge file details for download authorization.
   */
  async getChallengeFile(
    slug: string,
    fileId: string,
    _teamId?: string | null,
    isAdmin: boolean = false
  ) {
    const conditions = [eq(challenges.slug, slug)];
    if (!isAdmin) {
      conditions.push(eq(challenges.status, 'published'));
    }

    const [file] = await db
      .select({
        id: challengeFiles.id,
        filename: challengeFiles.filename,
        filePath: challengeFiles.filePath,
        fileSizeBytes: challengeFiles.fileSizeBytes,
        sha256Checksum: challengeFiles.sha256Checksum,
      })
      .from(challengeFiles)
      .innerJoin(challenges, eq(challengeFiles.challengeId, challenges.id))
      .where(and(...conditions, eq(challengeFiles.id, fileId)))
      .limit(1);

    return file || null;
  }

  /**
   * Unlocks a hint for a team, recording the unlock in team_hints.
   */
  async unlockHint(slug: string, hintId: string, userId: string, teamId: string) {
    const [hint] = await db
      .select({
        id: hints.id,
        content: hints.content,
        penaltyPoints: hints.penaltyPoints,
        orderNumber: hints.orderNumber,
      })
      .from(hints)
      .innerJoin(challenges, eq(hints.challengeId, challenges.id))
      .where(and(eq(challenges.slug, slug), eq(hints.id, hintId)))
      .limit(1);

    if (!hint) {
      throw new Error('HINT_NOT_FOUND');
    }

    // Check if already unlocked (idempotent)
    const [existing] = await db
      .select()
      .from(teamHints)
      .where(and(eq(teamHints.teamId, teamId), eq(teamHints.hintId, hintId)))
      .limit(1);

    if (existing) {
      return {
        hintId: hint.id,
        content: hint.content,
        penaltyPoints: hint.penaltyPoints,
        alreadyUnlocked: true,
      };
    }

    // Record team unlock
    await db.insert(teamHints).values({
      teamId,
      hintId,
      unlockedByUserId: userId,
    });

    return {
      hintId: hint.id,
      content: hint.content,
      penaltyPoints: hint.penaltyPoints,
      alreadyUnlocked: false,
    };
  }

  /**
   * Lists all available categories with published challenge metrics.
   */
  async listCategories() {
    const cats = await db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        description: categories.description,
        displayOrder: categories.displayOrder,
      })
      .from(categories)
      .orderBy(categories.displayOrder);

    const counts = await db
      .select({
        categoryId: challenges.categoryId,
        count: sql<number>`count(*)::int`,
      })
      .from(challenges)
      .where(eq(challenges.status, 'published'))
      .groupBy(challenges.categoryId);

    const countMap = new Map<string, number>();
    counts.forEach((c) => countMap.set(c.categoryId, c.count));

    return cats.map((cat) => ({
      ...cat,
      challengeCount: countMap.get(cat.id) || 0,
    }));
  }
}

export const challengesService = new ChallengesService();
