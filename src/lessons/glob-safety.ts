/**
 * Linear-time matcher for `file_glob` triggers.
 *
 * Recall runs every glob against the edited file on a mandatory hot path.
 * picomatch compiles globs to backtracking RegExps, and a crafted glob (nested
 * extglobs, many `*` in one segment, `(a+)+` passed through as regex) can take
 * seconds to minutes per file. Here a glob from the safe subset (glob-parse.ts)
 * is matched by dynamic programming (glob-dp.ts) over path segments and
 * characters, so the cost is O(pattern × path) and capped by a work budget. Results equal
 * picomatch({ dot: true }) on recall-shaped paths (project-relative, optional
 * leading `../`, no empty or trailing-slash segments); the parity test fuzzes it.
 */

import { matchSegments } from './glob-dp.js';
import { parseGlob, type GlobSegment, type ParsedGlob } from './glob-parse.js';
import type { Trigger } from './graph-schema.js';
import type { WorkBudget } from './regex-linear/index.js';
import type { ValidationFinding } from './validate.js';

/** Longer inputs are not real paths; they never match. */
export const MAX_GLOB_PATH_LENGTH = 4096;
/** Per-match cap on DP cells (~1 ms); a legitimate match uses a few hundred. */
const MATCH_WORK_LIMIT = 200_000;
const CACHE_LIMIT = 2000;

export interface GlobMatcher {
  /** True when `path` matches. Charges `budget` when given; out of work = no match. */
  test(path: string, budget?: WorkBudget): boolean;
}

const cache = new Map<string, GlobMatcher | null>();

/** UNSAFE_GLOB_PATTERN finding for validate; backslash globs have their own code. */
export function unsafeGlobFinding(triggerId: string, trigger: Trigger): ValidationFinding | null {
  if (trigger.kind !== 'file_glob' || trigger.pattern.includes('\\')) return null;
  const reason = parseGlob(trigger.pattern);
  if (typeof reason !== 'string') return null;
  return {
    level: 'error',
    code: 'UNSAFE_GLOB_PATTERN',
    message: `Trigger "${triggerId}" has a file_glob outside the safe glob subset (${trigger.pattern.slice(0, 120)}): ${reason}. Recall treats it as a non-match. Use only *, **, ?, [...] and {a,b}.`,
    triggerId,
  };
}

/** A linear-time matcher for `pattern`, or null when it is unsafe (never matches). */
export function getGlobMatcher(pattern: string): GlobMatcher | null {
  const hit = cache.get(pattern);
  if (hit !== undefined) return hit;
  if (cache.size >= CACHE_LIMIT) cache.clear();
  // Compare composed (NFC) forms: macOS can hand over decomposed (NFD) paths.
  const composed = pattern.normalize('NFC');
  const parsed = parseGlob(composed);
  const matcher = typeof parsed === 'string' ? null : build(composed, parsed);
  cache.set(pattern, matcher);
  return matcher;
}

function build(pattern: string, parsed: ParsedGlob): GlobMatcher {
  const alts = parsed.alternatives.map(prepare);
  return {
    test(rawPath: string, budget?: WorkBudget): boolean {
      const path = rawPath.normalize('NFC');
      if (path === pattern) return true; // picomatch's literal-equality shortcut
      if (path === '' || path.length > MAX_GLOB_PATH_LENGTH) return false;
      const live = alts.filter((a) => mayMatch(a, path));
      if (live.length === 0) return parsed.negated;
      const limit = Math.min(MATCH_WORK_LIMIT, budget?.remaining ?? MATCH_WORK_LIMIT);
      const work: WorkBudget = { remaining: limit };
      const segments = path.split('/');
      const hit = live.some((a) => matchSegments(a.alt, segments, work));
      if (budget !== undefined) budget.remaining -= limit - work.remaining;
      return work.remaining > 0 && hit !== parsed.negated;
    },
  };
}

/** An alternative plus cheap necessary conditions checked before the DP. */
interface PreparedAlt {
  readonly alt: readonly GlobSegment[];
  /** Literal first segment: must equal the first path segment. */
  readonly head: string | null;
  /** Literal end of the last segment: the path must end with it. */
  readonly tail: string;
}

function mayMatch({ head, tail }: PreparedAlt, path: string): boolean {
  if (!path.endsWith(tail)) return false;
  if (head === null) return true;
  return path.startsWith(head) && (path.length === head.length || path[head.length] === '/');
}

function prepare(alt: readonly GlobSegment[]): PreparedAlt {
  const first = alt[0];
  const last = alt[alt.length - 1];
  let tail = '';
  if (last?.k === 'segment' && !last.matchesEmpty) {
    for (let k = last.tokens.length - 1; k >= 0; k -= 1) {
      const tok = last.tokens[k]!;
      if (tok.k !== 'lit') break;
      tail = tok.ch + tail;
    }
  }
  return { alt, head: first?.k === 'segment' ? first.literal : null, tail };
}
