import { z } from 'zod';

export type CompetitionLifecycleState =
  | 'draft'
  | 'scheduled'
  | 'registration_open'
  | 'live'
  | 'paused'
  | 'ended'
  | 'archived';

export const ALLOWED_TRANSITIONS: Record<CompetitionLifecycleState, CompetitionLifecycleState[]> = {
  draft: ['scheduled', 'registration_open'],
  scheduled: ['registration_open', 'live'],
  registration_open: ['live'],
  live: ['paused', 'ended'],
  paused: ['live', 'ended'],
  ended: ['archived'],
  archived: [],
};

export const transitionStateSchema = z.object({
  targetState: z.enum([
    'draft',
    'scheduled',
    'registration_open',
    'live',
    'paused',
    'ended',
    'archived',
  ]),
  reason: z.string().min(3, 'Reason must be at least 3 characters').max(500),
});

export type TransitionStateInput = z.infer<typeof transitionStateSchema>;

export const updateCompetitionConfigSchema = z
  .object({
    name: z.string().min(2).max(150).optional(),
    startTime: z.string().datetime().nullable().optional(),
    endTime: z.string().datetime().nullable().optional(),
    registrationStartTime: z.string().datetime().nullable().optional(),
    registrationEndTime: z.string().datetime().nullable().optional(),
    timezone: z.string().min(2).max(50).optional(),
    isSubmissionEnabled: z.boolean().optional(),
    defaultChallengeVisibility: z.enum(['hidden', 'published']).optional(),
    reason: z.string().min(3).max(500).optional(),
  })
  .refine(
    (data) => {
      const regStart = data.registrationStartTime ? new Date(data.registrationStartTime).getTime() : null;
      const regEnd = data.registrationEndTime ? new Date(data.registrationEndTime).getTime() : null;
      const start = data.startTime ? new Date(data.startTime).getTime() : null;
      const end = data.endTime ? new Date(data.endTime).getTime() : null;

      if (regStart && regEnd && regStart >= regEnd) {
        return false;
      }
      if (start && end && start >= end) {
        return false;
      }
      if (regEnd && start && regEnd > start) {
        return false;
      }
      return true;
    },
    {
      message: 'Invalid timeline: registration_start < registration_end <= start_time < end_time required',
    }
  );

export type UpdateCompetitionConfigInput = z.infer<typeof updateCompetitionConfigSchema>;

export const emergencyPauseSchema = z.object({
  reason: z.string().min(5, 'Reason of at least 5 characters required for emergency pause').max(500),
});

export type EmergencyPauseInput = z.infer<typeof emergencyPauseSchema>;

export const resumeCompetitionSchema = z.object({
  reason: z.string().min(5, 'Reason of at least 5 characters required to resume competition').max(500),
});

export type ResumeCompetitionInput = z.infer<typeof resumeCompetitionSchema>;
