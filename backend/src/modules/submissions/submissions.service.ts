import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { challenges, submissions } from '../../db/schema.js';
import { verifyFlag } from '../../utils/flags.js';
import { scoringService, FinalSolveResult } from '../scoring/scoring.service.js';
import { SubmitFlagInput } from './submissions.schema.js';
import { config } from '../../config/env.js';

export interface SubmissionResponse {
  status: 'correct' | 'incorrect' | 'already_solved';
  pointsAwarded?: number;
  challengeSolved?: boolean;
  newTeamScore?: number;
}

export class SubmissionsService {
  /**
   * Evaluates flag submission, audits attempt, and invokes atomic scoring engine if correct.
   */
  async submitFlag(params: {
    userId: string;
    teamId: string;
    input: SubmitFlagInput;
    ipAddress: string;
    userAgent?: string;
    isAdmin?: boolean;
  }): Promise<SubmissionResponse> {
    const { userId, teamId, input, ipAddress, userAgent, isAdmin = false } = params;

    // 1. Verify Competition State
    if (config.COMPETITION_STATE !== 'active' && !isAdmin) {
      throw new Error('COMPETITION_NOT_ACTIVE');
    }

    // 2. Fetch challenge definition
    const conditions = [eq(challenges.slug, input.challengeSlug)];
    if (!isAdmin) {
      conditions.push(eq(challenges.status, 'published'));
      conditions.push(
        sql`(${challenges.releaseTime} IS NULL OR ${challenges.releaseTime} <= NOW())`
      );
    }

    const [chal] = await db
      .select({
        id: challenges.id,
        flagHash: challenges.flagHash,
        isDynamicHmac: challenges.isDynamicHmac,
      })
      .from(challenges)
      .where(and(...conditions))
      .limit(1);

    if (!chal) {
      throw new Error('CHALLENGE_NOT_FOUND');
    }

    // 3. Verify submitted flag using constant-time evaluation
    const isCorrect = verifyFlag(input.flag, chal.flagHash, {
      isDynamicHmac: chal.isDynamicHmac,
      hmacSecret: chal.flagHash,
      teamId,
    });

    if (!isCorrect) {
      // Audit incorrect attempt in submissions table
      await db.insert(submissions).values({
        teamId,
        userId,
        challengeId: chal.id,
        submittedFlag: input.flag,
        isCorrect: false,
        ipAddress,
        userAgent,
      });

      return { status: 'incorrect' };
    }

    // 4. Correct flag: delegate to atomic scoring engine
    const solveResult: FinalSolveResult = await scoringService.awardFinalSolve({
      teamId,
      userId,
      challengeId: chal.id,
      submittedFlag: input.flag,
      ipAddress,
      userAgent,
    });

    return solveResult;
  }
}

export const submissionsService = new SubmissionsService();
