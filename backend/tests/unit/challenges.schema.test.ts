import { describe, it, expect } from 'vitest';
import {
  challengeFilterSchema,
  unlockHintParamsSchema,
  validateCheckpointSchema,
} from '../../src/modules/challenges/challenges.schema.js';

describe('Challenge Schema Validation', () => {
  it('validates difficulty and category filters', () => {
    const valid = challengeFilterSchema.safeParse({
      category: 'web',
      difficulty: 'expert',
    });
    expect(valid.success).toBe(true);

    const invalid = challengeFilterSchema.safeParse({
      difficulty: 'impossible', // not allowed
    });
    expect(invalid.success).toBe(false);
  });

  it('validates hint unlock params', () => {
    const valid = unlockHintParamsSchema.safeParse({
      slug: 'sql-injection-101',
      hintId: '123e4567-e89b-12d3-a456-426614174000',
    });
    expect(valid.success).toBe(true);

    const invalid = unlockHintParamsSchema.safeParse({
      slug: 'sql-injection-101',
      hintId: 'not-a-uuid',
    });
    expect(invalid.success).toBe(false);
  });

  it('validates checkpoint proof submissions', () => {
    const valid = validateCheckpointSchema.safeParse({ proof: 'token_abc123' });
    expect(valid.success).toBe(true);

    const empty = validateCheckpointSchema.safeParse({ proof: '' });
    expect(empty.success).toBe(false);
  });
});
