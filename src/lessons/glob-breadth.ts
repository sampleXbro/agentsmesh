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
 * a capture.
 */
export const BROAD_GLOB_NARROWNESS = 0.34;

export function isBroadFileGlob(pattern: string): boolean {
  return globNarrowness(pattern) < BROAD_GLOB_NARROWNESS;
}
