import { describe, it, expect } from 'vitest';
import { config, validateProductionSecrets, Env } from '../../src/config/env.js';

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

  it('should reject default or short development secrets in production mode', () => {
    const insecureProdConfig: Env = {
      ...config,
      NODE_ENV: 'production',
      JWT_SECRET: 'super_secret_jwt_key_techx_ctf_change_me_in_production_32chars!', // default dev
    };

    expect(() => validateProductionSecrets(insecureProdConfig)).toThrow(
      'Production environment secret validation failed'
    );
  });

  it('should accept cryptographically strong secrets in production mode', () => {
    const secureProdConfig: Env = {
      ...config,
      NODE_ENV: 'production',
      JWT_SECRET: 'a_very_long_secure_jwt_secret_with_more_than_32_characters_12345',
      COOKIE_SECRET: 'a_very_long_secure_cookie_secret_with_more_than_32_characters_123',
      CHALLENGE_GATEWAY_SECRET: 'a_very_long_secure_gateway_secret_with_more_than_32_characters',
      FLAG_SALT: 'a_very_long_secure_flag_salt_12345',
      DB_PASSWORD: 'strong_production_database_password_987654',
      REDIS_PASSWORD: 'strong_production_redis_password_987654',
    };

    expect(() => validateProductionSecrets(secureProdConfig)).not.toThrow();
  });
});
