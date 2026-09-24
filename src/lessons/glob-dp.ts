/**
 * Dynamic-programming core of the linear glob matcher (see glob-safety.ts).
 * Two nested tables: pattern segments × path segments, and inside one segment,
 * tokens × characters. No backtracking, so cost is O(pattern × path); every
 * cell is charged to `work` and an exhausted budget returns false.
 */

import type { GlobSegment, GlobToken } from './glob-parse.js';
import type { WorkBudget } from './regex-linear/index.js';

const isDotSegment = (s: string): boolean => s === '.' || s === '..';

/** DP over (pattern segment i, path segment j): does alt[i..] match segments[j..]? */
export function matchSegments(
  alt: readonly GlobSegment[],
  segments: string[],
  work: WorkBudget,
): boolean {
  const n = segments.length;
  let next = new Uint8Array(n + 1);
  next[n] = 1;
  for (let i = alt.length - 1; i >= 0; i -= 1) {
    const seg = alt[i]!;
    const cur = new Uint8Array(n + 1);
    for (let j = n; j >= 0; j -= 1) {
      if (--work.remaining <= 0) return false;
      if (seg.k === 'globstar') {
        const eat = j < n && !isDotSegment(segments[j]!) && (cur[j + 1] === 1 || next[j + 1] === 1);
        cur[j] = (!seg.min1 && next[j] === 1) || eat ? 1 : 0;
      } else if (j < n && next[j + 1] === 1) {
        const text = segments[j]!;
        const ok =
          seg.literal !== null ? text === seg.literal : matchSegment(seg, text, j < n - 1, work);
        cur[j] = ok ? 1 : 0;
      }
    }
    // Set after the loop so a globstar that consumed segments cannot use it.
    if (seg.k === 'globstar' && i >= 1 && tailMatchesNothing(alt, i + 1)) cur[n] = 1;
    next = cur;
  }
  return next[0] === 1;
}

/**
 * picomatch quirk: a globstar followed by a segment like `{,a}` (optionally then
 * one more globstar) also matches when the path ends right before the globstar.
 */
function tailMatchesNothing(alt: readonly GlobSegment[], from: number): boolean {
  const empty = alt[from];
  const rest = alt[from + 1];
  if (empty?.k !== 'segment' || !empty.matchesEmpty) return false;
  return rest === undefined || (rest.k === 'globstar' && !rest.min1 && from + 2 === alt.length);
}

/** DP over (token k, char c) within one segment. */
function matchSegment(
  seg: Extract<GlobSegment, { k: 'segment' }>,
  text: string,
  followedBySlash: boolean,
  work: WorkBudget,
): boolean {
  if (seg.guarded && (isDotSegment(text) || (text === '' && !followedBySlash))) return false;
  const tokens = seg.tokens;
  const len = text.length;
  let next = new Uint8Array(len + 1);
  next[len] = 1;
  for (let k = tokens.length - 1; k >= 0; k -= 1) {
    const tok = tokens[k]!;
    const cur = new Uint8Array(len + 1);
    work.remaining -= len + 1;
    if (work.remaining <= 0) return false;
    for (let c = len; c >= 0; c -= 1) {
      cur[c] = tokenMatches(tok, text, c, next, cur) ? 1 : 0;
    }
    next = cur;
  }
  return next[0] === 1;
}

function tokenMatches(
  tok: GlobToken,
  text: string,
  c: number,
  next: Uint8Array,
  cur: Uint8Array,
): boolean {
  const ch = text[c];
  switch (tok.k) {
    case 'star':
      return next[c] === 1 || (ch !== undefined && cur[c + 1] === 1);
    case 'one':
      return ch !== undefined && next[c + 1] === 1;
    case 'lit':
      return ch === tok.ch && next[c + 1] === 1;
    case 'class':
      return (
        (ch !== undefined && tok.test(ch) && next[c + 1] === 1) ||
        (tok.literal !== null &&
          text.startsWith(tok.literal, c) &&
          next[c + tok.literal.length] === 1)
      );
  }
}
