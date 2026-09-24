/**
 * Git conflict-marker handling for lessons.json. Used to tell a merge conflict
 * apart from a corrupt file, and by `lessons resolve` to rebuild both sides
 * when the index no longer holds the merge stages.
 */

const OPEN = /^<{7}(?: |$)/;
const BASE = /^\|{7}(?: |$)/;
const SEPARATOR = /^={7}$/;
const CLOSE = /^>{7}(?: |$)/;

interface ConflictSides {
  /** Null unless every block carried a diff3 base section. */
  readonly base: string | null;
  readonly ours: string;
  readonly theirs: string;
}

/** A JSON line never starts with 7 angle brackets, so one such line means a conflict. */
export function hasConflictMarkers(text: string): boolean {
  return /^(?:<{7}|>{7})(?: |\r?$)/m.test(text);
}

type Section = 'common' | 'ours' | 'base' | 'theirs';

/** Rebuild each side's full text; null when there is no well-formed conflict block. */
export function splitConflictSides(text: string): ConflictSides | null {
  const out: Record<Exclude<Section, 'common'>, string[]> = { ours: [], base: [], theirs: [] };
  let section: Section = 'common';
  let blocks = 0;
  let blocksWithBase = 0;
  for (const line of text.split(/(?<=\n)/)) {
    const bare = line.replace(/\r?\n$/, '');
    if (section === 'common' && OPEN.test(bare)) {
      section = 'ours';
      blocks += 1;
    } else if (section === 'ours' && BASE.test(bare)) {
      section = 'base';
      blocksWithBase += 1;
    } else if ((section === 'ours' || section === 'base') && SEPARATOR.test(bare)) {
      section = 'theirs';
    } else if (section === 'theirs' && CLOSE.test(bare)) {
      section = 'common';
    } else if (section === 'common') {
      out.ours.push(line);
      out.base.push(line);
      out.theirs.push(line);
    } else {
      out[section].push(line);
    }
  }
  if (blocks === 0 || section !== 'common') return null;
  return {
    base: blocksWithBase === blocks ? out.base.join('') : null,
    ours: out.ours.join(''),
    theirs: out.theirs.join(''),
  };
}
