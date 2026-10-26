/**
 * Category utility functions for handling both string and object-based
 * category formats returned by the backend API.
 */

export interface CategoryObject {
  id?: string;
  name?: string;
  slug?: string;
}

export type CategoryValue = string | CategoryObject | undefined | null;

/**
 * Safely extracts human-readable category name for UI display.
 */
export function getCategoryName(category: CategoryValue): string {
  if (!category) return 'GENERAL';
  if (typeof category === 'string') return category;
  if (typeof category === 'object') {
    return category.name || category.slug?.toUpperCase() || 'GENERAL';
  }
  return 'GENERAL';
}

/**
 * Safely extracts category slug for filtering and comparisons.
 */
export function getCategorySlug(category: CategoryValue): string {
  if (!category) return 'general';
  if (typeof category === 'string') return category.toLowerCase();
  if (typeof category === 'object') {
    return category.slug?.toLowerCase() || category.name?.toLowerCase() || 'general';
  }
  return 'general';
}

/**
 * Determines whether a challenge's category matches the user-selected category tab.
 */
export function matchesCategory(category: CategoryValue, selectedCategory: string): boolean {
  if (!selectedCategory || selectedCategory === 'ALL') return true;

  const target = selectedCategory.trim().toUpperCase();
  const name = getCategoryName(category).toUpperCase();
  const slug = getCategorySlug(category).toUpperCase();

  if (name === target || slug === target) return true;

  // Standard CTF aliases and substring matching
  if (target === 'WEB' && (slug === 'WEB' || name.includes('WEB'))) return true;
  if (target === 'CRYPTO' && (slug === 'CRYPTO' || name.includes('CRYPTO'))) return true;
  if (target === 'FORENSICS' && (slug === 'FORENSICS' || name.includes('FORENSIC'))) return true;
  if (target === 'REVERSE' && (slug === 'REV' || slug === 'REVERSE' || name.includes('REVERSE'))) return true;
  if (target === 'PWN' && (slug === 'PWN' || name.includes('BINARY') || name.includes('PWN') || name.includes('EXPLOIT'))) return true;
  if (target === 'OSINT' && (slug === 'OSINT' || name.includes('OSINT'))) return true;

  return false;
}
