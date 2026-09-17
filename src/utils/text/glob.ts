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
