/**
 * How narrow a `file_glob` trigger is.
 *
 * Trigger ids are content-addressed, so two lessons never share a pattern and
 * the fanout signal alone cannot tell `src/lessons/recall.ts` from
 * `src/lessons/**` — both are referenced once and both score maximum
 * specificity. Recall then delivers a subsystem-wide rule ahead of the one rule
 * written about the file being edited, and the token budget drops the rest.
 *
 * Narrowness is the share of path segments the pattern pins down literally. A
 * `**` counts as no literal segment AND widens the denominator, because it can
 * span any depth. A negated glob matches every path but its own, so it scores 0.
 */

import { getGlobMatcher } from './glob-safety.js';

const WILDCARD = /[*?[\]]/;

/** A leading `!` (see glob-parse.ts): the trigger fires on every path it does NOT match. */
export function isNegatedGlob(pattern: string): boolean {
  return pattern.startsWith('!');
}

/** Narrowness in [0,1]: 1 = an exact path, 0 = matches the whole tree. */
export function globNarrowness(pattern: string): number {
  if (isNegatedGlob(pattern)) return 0;
  const segments = pattern
    .replaceAll('\\', '/')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.');
  if (segments.length === 0) return 0;
  let literal = 0;
  let globstars = 0;
  for (const segment of segments) {
    if (segment === '**') globstars += 1;
    else if (!WILDCARD.test(segment)) literal += 1;
  }
  return literal / (segments.length + globstars);
}

/**
 * Broad enough that recall would fire it on most of the repo. Advisory only:
 * a deliberate file-CLASS trigger such as a per-target `index.ts` pattern is the
 * documented way to write a rule about general behaviour, so this never blocks
 * a capture. The one blocking case is {@link isCatchAllGlob}.
 */
export const BROAD_GLOB_NARROWNESS = 0.34;

export function isBroadFileGlob(pattern: string): boolean {
  return globNarrowness(pattern) < BROAD_GLOB_NARROWNESS;
}

/**
 * Repo-shaped paths a catch-all glob must all match: a root file without an
 * extension, a dotfile, a dot directory, a deep nested file, a path with a
 * space or non-ASCII letters, and the usual build and dependency folders.
 */
export const GLOB_PROBE_PATHS: readonly string[] = [
  'LICENSE',
  'package.json',
  '.gitignore',
  'src/index.ts',
  'src/lib/deep/nested/util.test.ts',
  '.github/workflows/ci.yml',
  'docs/guide/intro.md',
  'docs/my notes.txt',
  'assets/logo.png',
  'dist/app.min.js.map',
  'node_modules/pkg/index.js',
  'src/naïve/файл.ts',
];

// A glob that matches EVERY probe path, so it would fire on every file edit.
// Probed with the same linear matcher recall uses (like the command-pattern
// breadth check), so a bare globstar, a globstar plus a lone star segment, a
// `./` prefix and a brace group holding one of those all count, with no
// glob-shape heuristics.
//
// Not catch-alls, by design: a bare `*` (only root files), a globstar plus
// `*.*` (skips extensionless files such as LICENSE), a globstar plus a star
// directory and then a globstar (needs a directory level), and a negated glob
// (it excludes the paths it names). They stay advisory warnings.
export function isCatchAllGlob(pattern: string): boolean {
  if (isNegatedGlob(pattern)) return false;
  const matcher = getGlobMatcher(pattern);
  return matcher !== null && GLOB_PROBE_PATHS.every((path) => matcher.test(path));
}
