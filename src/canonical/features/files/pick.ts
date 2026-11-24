/**
 * Cherry-pick copied files with the same picomatch globs as rule `globs:`.
 */

import type { CanonicalCopiedFile } from './types.js';
import { globMatch, globMatchAny } from '../../../utils/text/glob.js';
import { logger } from '../../../utils/output/logger.js';

/**
 * Filter `files` by `patterns`. Empty/undefined patterns keep every file.
 * Warns once per pattern that matched nothing in the source.
 */
export function applyFilesPick(
  files: readonly CanonicalCopiedFile[],
  patterns: readonly string[] | undefined,
  extendName: string,
): CanonicalCopiedFile[] {
  if (!patterns?.length) return [...files];
  for (const pattern of patterns) {
    const body = pattern.startsWith('!') ? pattern.slice(1) : pattern;
    if (body === '') continue;
    if (!files.some((f) => globMatch(f.path, body))) {
      logger.warn(
        `[agentsmesh] pick pattern "${pattern}" matched no files from extend "${extendName}".`,
      );
    }
  }
  return files.filter((f) => globMatchAny(f.path, patterns));
}
