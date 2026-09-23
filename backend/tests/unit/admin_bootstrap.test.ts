import { describe, it, expect, vi } from 'vitest';
import { bootstrapAdmin } from '../../src/scripts/bootstrap_admin.js';

describe('Admin Bootstrap System', () => {
  it('fails fast if required bootstrap credentials are not provided', async () => {
    await expect(bootstrapAdmin({ username: '', email: '', password: '' })).rejects.toThrow(
      'Admin bootstrap requires ADMIN_USERNAME, ADMIN_EMAIL, and ADMIN_PASSWORD'
    );
  });

  it('enforces a minimum password length of 12 characters for production administrators', async () => {
    await expect(
      bootstrapAdmin({
        username: 'shortadmin',
        email: 'short@techxmadras.org',
        password: 'short',
      })
    ).rejects.toThrow('Admin bootstrap password must be at least 12 characters long');
  });

  it('enforces username length constraints (3 to 50 chars)', async () => {
    await expect(
      bootstrapAdmin({
        username: 'ab',
        email: 'shortuser@techxmadras.org',
        password: 'valid_secure_admin_password_123',
      })
    ).rejects.toThrow('Admin bootstrap username must be between 3 and 50 characters');
  });
});
