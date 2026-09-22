import { describe, it, expect } from 'vitest';
import { config } from '../../src/config/env.js';

describe('Environment Configuration Validation', () => {
  it('should load default configuration values correctly', () => {
    expect(config).toBeDefined();
    expect(config.APP_PORT).toBeTypeOf('number');
    expect(['lan', 'production']).toContain(config.DEPLOYMENT_MODE);
    expect(config.FLAG_PREFIX).toBe('TECHX{');
    expect(config.TEAM_MAX_MEMBERS).toBeGreaterThanOrEqual(1);
  });

  it('should enforce non-empty secrets', () => {
    expect(config.JWT_SECRET.length).toBeGreaterThanOrEqual(16);
    expect(config.COOKIE_SECRET.length).toBeGreaterThanOrEqual(16);
  });

  it('should parse database and redis URLs', () => {
    expect(config.DATABASE_URL).toContain('postgresql://');
    expect(config.REDIS_URL).toContain('redis://');
  });
});
