import picomatch from 'picomatch';
import type { GitPathHistory } from './git-path-history.js';
import { getGlobMatcher } from './glob-safety.js';

/**
 * Verdict for a `file_glob` that matches no file on disk:
 * - `live`: it matches a tracked path (deleted from disk but not committed).
 * - `dead`: HEAD history removed what it matched, so it can never fire again
 *   without a re-point. Only this state may be detached.
 * - `pending`: no proof of removal. The path may not exist yet, be ignored build
 *   output, live on another branch, or git evidence is missing. Kept.
 *
 * A wildcard glob is dead only when its paths were renamed away: deleted-only
 * matches are a class of files that come and go (a release deletes every
 * changeset, the next change adds one). A glob outside the safe subset is
 * never judged: it stays `pending`.
 */
export type MissingGlobState = 'live' | 'dead' | 'pending';

export function missingGlobState(
  pattern: string,
  history: GitPathHistory | null,
): MissingGlobState {
  const matcher = getGlobMatcher(pattern);
  if (history === null || matcher === null) return 'pending';
  const matchesAny = (paths: ReadonlySet<string>): boolean =>
    [...paths].some((p) => matcher.test(p));
  if (matchesAny(history.tracked)) return 'live';
  if (matchesAny(history.renamedAway)) return 'dead';
  if (!picomatch.scan(pattern).isGlob && matchesAny(history.deleted)) return 'dead';
  return 'pending';
}
