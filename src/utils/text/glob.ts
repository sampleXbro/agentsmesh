/** Glob matching for rule `globs:` patterns, backed by picomatch. */

import picomatch from 'picomatch';

const OPTIONS = { dot: true } as const;

export function globMatch(filepath: string, pattern: string): boolean {
  return picomatch(pattern, OPTIONS)(filepath);
}

export function globFilter(files: string[], pattern: string): string[] {
  const isMatch = picomatch(pattern, OPTIONS);
  return files.filter((file) => isMatch(file));
}

/**
 * True when `filepath` matches at least one positive pattern and no `!` exclusion.
 * A later positive pattern does not restore a path excluded by `!` (unlike gitignore).
 */
export function globMatchAny(filepath: string, patterns: readonly string[]): boolean {
  const positives: string[] = [];
  const negatives: string[] = [];
  for (const pattern of patterns) {
    if (pattern.startsWith('!')) {
      const body = pattern.slice(1);
      if (body !== '') negatives.push(body);
    } else if (pattern !== '') {
      positives.push(pattern);
    }
  }
  if (positives.length === 0) return false;
  if (!positives.some((p) => globMatch(filepath, p))) return false;
  return !negatives.some((p) => globMatch(filepath, p));
}
