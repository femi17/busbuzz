// ============================================================
// BusBuzz name utilities
// ============================================================

// Common honorifics used in profile names (Western + Nigerian) that should
// never be shown as a person's "first name" in a greeting.
const NAME_TITLES = new Set([
  'mr', 'mrs', 'ms', 'miss', 'mx', 'dr', 'prof', 'professor',
  'chief', 'engr', 'engineer', 'barr', 'barrister', 'rev', 'reverend',
  'pastor', 'elder', 'alhaji', 'alhaja', 'otunba', 'hon', 'honourable',
  'honorable',
]);

/**
 * Extract a person's first name from a full name, skipping any leading
 * honorific(s) (e.g. "Mr Femi Oduola" -> "Femi", "Chief Dr Femi" -> "Femi").
 * Never reduces to an empty string if the whole name is just a title.
 */
export function getFirstName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  let i = 0;
  while (
    i < parts.length - 1 &&
    NAME_TITLES.has(parts[i].replace(/\.$/, '').toLowerCase())
  ) {
    i++;
  }
  return parts[i] ?? '';
}
