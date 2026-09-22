import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ALLOWED_TRANSITIONS,
  updateCompetitionConfigSchema,
  CompetitionLifecycleState,
} from '../../src/modules/competition/competition.schema.js';
import { CompetitionService } from '../../src/modules/competition/competition.service.js';

describe('Competition Lifecycle State Machine & Timeline Invariants', () => {
  let competitionService: CompetitionService;

  beforeEach(() => {
    competitionService = new CompetitionService();
  });

  // ---------------------------------------------------------------------------
  // 1. ALLOWED TRANSITIONS GRAPH
  // ---------------------------------------------------------------------------
  describe('State Machine Graph Validation', () => {
    it('allows DRAFT -> SCHEDULED and DRAFT -> REGISTRATION_OPEN', () => {
      expect(ALLOWED_TRANSITIONS['draft']).toEqual(['scheduled', 'registration_open']);
    });

    it('allows SCHEDULED -> REGISTRATION_OPEN and SCHEDULED -> LIVE', () => {
      expect(ALLOWED_TRANSITIONS['scheduled']).toEqual(['registration_open', 'live']);
    });

    it('allows REGISTRATION_OPEN -> LIVE', () => {
      expect(ALLOWED_TRANSITIONS['registration_open']).toEqual(['live']);
    });

    it('allows LIVE -> PAUSED and LIVE -> ENDED', () => {
      expect(ALLOWED_TRANSITIONS['live']).toEqual(['paused', 'ended']);
    });

    it('allows PAUSED -> LIVE and PAUSED -> ENDED', () => {
      expect(ALLOWED_TRANSITIONS['paused']).toEqual(['live', 'ended']);
    });

    it('allows ENDED -> ARCHIVED only', () => {
      expect(ALLOWED_TRANSITIONS['ended']).toEqual(['archived']);
    });

    it('disallows any transitions out of ARCHIVED (terminal state)', () => {
      expect(ALLOWED_TRANSITIONS['archived']).toEqual([]);
    });

    // Negative transition checks
    const illegalTransitions: [CompetitionLifecycleState, CompetitionLifecycleState][] = [
      ['draft', 'ended'],
      ['draft', 'paused'],
      ['draft', 'archived'],
      ['draft', 'live'],
      ['live', 'draft'],
      ['paused', 'draft'],
      ['ended', 'live'],
      ['ended', 'paused'],
      ['ended', 'draft'],
      ['archived', 'live'],
      ['archived', 'draft'],
      ['archived', 'ended'],
    ];

    it.each(illegalTransitions)(
      'rejects invalid transition %s -> %s',
      (fromState, toState) => {
        const allowed = ALLOWED_TRANSITIONS[fromState] || [];
        expect(allowed).not.toContain(toState);
      }
    );
  });

  // ---------------------------------------------------------------------------
  // 2. PARTICIPANT SCORING GATING (requireLiveCompetition)
  // ---------------------------------------------------------------------------
  describe('requireLiveCompetition Participant Gating', () => {
    it('throws COMPETITION_NOT_ACTIVE when state is draft', async () => {
      vi.spyOn(competitionService, 'getCompetitionState').mockResolvedValueOnce({
        id: 'default',
        name: 'TechX CTF',
        state: 'draft',
        startTime: null,
        endTime: null,
        registrationStartTime: null,
        registrationEndTime: null,
        timezone: 'Asia/Kolkata',
        isSubmissionEnabled: false,
        defaultChallengeVisibility: 'hidden',
        updatedAt: new Date(),
      });

      await expect(competitionService.requireLiveCompetition()).rejects.toThrow(
        'COMPETITION_NOT_ACTIVE'
      );
    });

    it('throws COMPETITION_NOT_ACTIVE when state is scheduled', async () => {
      vi.spyOn(competitionService, 'getCompetitionState').mockResolvedValueOnce({
        id: 'default',
        name: 'TechX CTF',
        state: 'scheduled',
        startTime: null,
        endTime: null,
        registrationStartTime: null,
        registrationEndTime: null,
        timezone: 'Asia/Kolkata',
        isSubmissionEnabled: false,
        defaultChallengeVisibility: 'hidden',
        updatedAt: new Date(),
      });

      await expect(competitionService.requireLiveCompetition()).rejects.toThrow(
        'COMPETITION_NOT_ACTIVE'
      );
    });

    it('throws COMPETITION_NOT_ACTIVE when state is registration_open', async () => {
      vi.spyOn(competitionService, 'getCompetitionState').mockResolvedValueOnce({
        id: 'default',
        name: 'TechX CTF',
        state: 'registration_open',
        startTime: null,
        endTime: null,
        registrationStartTime: null,
        registrationEndTime: null,
        timezone: 'Asia/Kolkata',
        isSubmissionEnabled: false,
        defaultChallengeVisibility: 'hidden',
        updatedAt: new Date(),
      });

      await expect(competitionService.requireLiveCompetition()).rejects.toThrow(
        'COMPETITION_NOT_ACTIVE'
      );
    });

    it('throws COMPETITION_PAUSED when state is paused', async () => {
      vi.spyOn(competitionService, 'getCompetitionState').mockResolvedValueOnce({
        id: 'default',
        name: 'TechX CTF',
        state: 'paused',
        startTime: null,
        endTime: null,
        registrationStartTime: null,
        registrationEndTime: null,
        timezone: 'Asia/Kolkata',
        isSubmissionEnabled: false,
        defaultChallengeVisibility: 'hidden',
        updatedAt: new Date(),
      });

      await expect(competitionService.requireLiveCompetition()).rejects.toThrow(
        'COMPETITION_PAUSED'
      );
    });

    it('throws COMPETITION_ENDED when state is ended', async () => {
      vi.spyOn(competitionService, 'getCompetitionState').mockResolvedValueOnce({
        id: 'default',
        name: 'TechX CTF',
        state: 'ended',
        startTime: null,
        endTime: null,
        registrationStartTime: null,
        registrationEndTime: null,
        timezone: 'Asia/Kolkata',
        isSubmissionEnabled: false,
        defaultChallengeVisibility: 'hidden',
        updatedAt: new Date(),
      });

      await expect(competitionService.requireLiveCompetition()).rejects.toThrow(
        'COMPETITION_ENDED'
      );
    });

    it('throws COMPETITION_ARCHIVED when state is archived', async () => {
      vi.spyOn(competitionService, 'getCompetitionState').mockResolvedValueOnce({
        id: 'default',
        name: 'TechX CTF',
        state: 'archived',
        startTime: null,
        endTime: null,
        registrationStartTime: null,
        registrationEndTime: null,
        timezone: 'Asia/Kolkata',
        isSubmissionEnabled: false,
        defaultChallengeVisibility: 'hidden',
        updatedAt: new Date(),
      });

      await expect(competitionService.requireLiveCompetition()).rejects.toThrow(
        'COMPETITION_ARCHIVED'
      );
    });

    it('throws SUBMISSIONS_DISABLED when state is live but isSubmissionEnabled is false', async () => {
      vi.spyOn(competitionService, 'getCompetitionState').mockResolvedValueOnce({
        id: 'default',
        name: 'TechX CTF',
        state: 'live',
        startTime: null,
        endTime: null,
        registrationStartTime: null,
        registrationEndTime: null,
        timezone: 'Asia/Kolkata',
        isSubmissionEnabled: false,
        defaultChallengeVisibility: 'visible',
        updatedAt: new Date(),
      });

      await expect(competitionService.requireLiveCompetition()).rejects.toThrow(
        'SUBMISSIONS_DISABLED'
      );
    });

    it('resolves without error when state is live and isSubmissionEnabled is true', async () => {
      vi.spyOn(competitionService, 'getCompetitionState').mockResolvedValueOnce({
        id: 'default',
        name: 'TechX CTF',
        state: 'live',
        startTime: null,
        endTime: null,
        registrationStartTime: null,
        registrationEndTime: null,
        timezone: 'Asia/Kolkata',
        isSubmissionEnabled: true,
        defaultChallengeVisibility: 'visible',
        updatedAt: new Date(),
      });

      await expect(competitionService.requireLiveCompetition()).resolves.toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 3. TIMELINE SCHEMA VALIDATION
  // ---------------------------------------------------------------------------
  describe('Timeline Chronological Ordering Constraints', () => {
    it('accepts valid timeline: reg_start < reg_end <= start < end', () => {
      const validPayload = {
        registrationStartTime: '2026-09-01T00:00:00.000Z',
        registrationEndTime: '2026-09-10T00:00:00.000Z',
        startTime: '2026-09-15T09:00:00.000Z',
        endTime: '2026-09-17T18:00:00.000Z',
      };

      const result = updateCompetitionConfigSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it('rejects registrationStartTime >= registrationEndTime', () => {
      const invalidPayload = {
        registrationStartTime: '2026-09-10T00:00:00.000Z',
        registrationEndTime: '2026-09-05T00:00:00.000Z',
      };

      const result = updateCompetitionConfigSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toMatch(/Invalid timeline/i);
      }
    });

    it('rejects startTime >= endTime', () => {
      const invalidPayload = {
        startTime: '2026-09-20T00:00:00.000Z',
        endTime: '2026-09-15T00:00:00.000Z',
      };

      const result = updateCompetitionConfigSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toMatch(/Invalid timeline/i);
      }
    });

    it('rejects registrationEndTime > startTime', () => {
      const invalidPayload = {
        registrationEndTime: '2026-09-20T00:00:00.000Z',
        startTime: '2026-09-15T00:00:00.000Z',
      };

      const result = updateCompetitionConfigSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toMatch(/Invalid timeline/i);
      }
    });
  });
});
