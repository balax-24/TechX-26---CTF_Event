import { describe, it, expect } from 'vitest';
import { getCategoryName, getCategorySlug, matchesCategory } from '../../src/utils/category';

describe('Category utility functions', () => {
  it('safely extracts category names from string, object, and missing values', () => {
    expect(getCategoryName(undefined)).toBe('GENERAL');
    expect(getCategoryName(null)).toBe('GENERAL');
    expect(getCategoryName('')).toBe('GENERAL');
    expect(getCategoryName('Web Exploitation')).toBe('Web Exploitation');
    expect(getCategoryName({ name: 'Web Exploitation', slug: 'web' })).toBe('Web Exploitation');
    expect(getCategoryName({ slug: 'crypto' })).toBe('CRYPTO');
  });

  it('safely extracts category slugs from string, object, and missing values', () => {
    expect(getCategorySlug(undefined)).toBe('general');
    expect(getCategorySlug(null)).toBe('general');
    expect(getCategorySlug('')).toBe('general');
    expect(getCategorySlug('Web Exploitation')).toBe('web exploitation');
    expect(getCategorySlug({ name: 'Web Exploitation', slug: 'web' })).toBe('web');
    expect(getCategorySlug({ name: 'Cryptography' })).toBe('cryptography');
  });

  it('matches categories against filter selections correctly', () => {
    const webChal = { name: 'Web Exploitation', slug: 'web' };
    const revChal = { name: 'Reverse Engineering', slug: 'rev' };
    const pwnChal = { name: 'Binary Exploitation', slug: 'pwn' };

    expect(matchesCategory(webChal, 'ALL')).toBe(true);
    expect(matchesCategory(webChal, 'WEB')).toBe(true);
    expect(matchesCategory(webChal, 'Web Exploitation')).toBe(true);
    expect(matchesCategory(webChal, 'CRYPTO')).toBe(false);

    expect(matchesCategory(revChal, 'REVERSE')).toBe(true);
    expect(matchesCategory(pwnChal, 'PWN')).toBe(true);
    expect(matchesCategory('web', 'WEB')).toBe(true);
  });
});
