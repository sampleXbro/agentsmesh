/**
 * Parser for the `file_glob` subset that glob-safety.ts matches in linear time:
 * literals, `*`, `?`, `**` as a whole segment, `[...]` classes, `{a,b}` groups,
 * a leading `!` (negate) and a leading `./`. picomatch compiles anything beyond
 * that (extglobs, `(…)`/`|` groups, `+` after a class or brace) into raw,
 * backtracking regex, so those are rejected here: the caller gets an error
 * string and the trigger never matches (fail closed).
 */

import { expandBraces, fail, LED, markLedStars, MARK } from './glob-expand.js';

export const MAX_GLOB_LENGTH = 256;

export type GlobToken =
  | { readonly k: 'lit'; readonly ch: string }
  | { readonly k: 'star' }
  | { readonly k: 'one' }
  | { readonly k: 'class'; readonly test: (c: string) => boolean; readonly literal: string | null };

export type GlobSegment =
  | {
      readonly k: 'globstar';
      /** picomatch: a trailing `/**` after `…*` needs at least one more segment. */
      readonly min1: boolean;
    }
  | {
      readonly k: 'segment';
      readonly tokens: readonly GlobToken[];
      /** The segment text when it has no wildcard (compared directly). */
      readonly literal: string | null;
      /** Starts with a guarded `*`: never `.`/`..`, never an empty last segment. */
      readonly guarded: boolean;
      /** Only unguarded stars, like `{,a}` expanded to empty: may match nothing. */
      readonly matchesEmpty: boolean;
    };

export interface ParsedGlob {
  readonly negated: boolean;
  /** Brace expansions; the glob matches when any one of them matches. */
  readonly alternatives: readonly (readonly GlobSegment[])[];
}

/** Parse `pattern`, or return why it is outside the supported subset. */
export function parseGlob(pattern: string): ParsedGlob | string {
  try {
    return parseOrThrow(pattern);
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

function parseOrThrow(pattern: string): ParsedGlob {
  if (pattern.length > MAX_GLOB_LENGTH) fail(`longer than ${MAX_GLOB_LENGTH} characters`);
  if (pattern.includes('\\')) fail('backslash escapes are not supported (use / as separator)');
  // eslint-disable-next-line no-control-regex
  if (/["\u0000-\u001f]/.test(pattern)) fail('quotes and control characters are not supported');
  if (/[()|]/.test(pattern.replace(/\[[^\]/]*\]/g, ''))) {
    fail('extglobs and (…)/| groups are not supported (use {a,b})');
  }
  if (/[[\]{}]\+/.test(pattern)) fail('+ after a class or brace is a regex quantifier');
  const negated = pattern.startsWith('!');
  let body = negated ? pattern.slice(1) : pattern;
  if (body.startsWith('./')) body = body.slice(2);
  if (body.startsWith('!') || body.startsWith('./')) fail('use a single leading ! and ./');
  if (body === '') fail('empty pattern');
  // picomatch's fast path for exactly `*.*` / `**/*.*` needs a char after the dot.
  const fastPath = !negated && (body === '*.*' || body === '**/*.*');
  if (fastPath) body = `${body.slice(0, -1)}?*`;
  return { negated, alternatives: expandBraces(markLedStars(body)).map(parseAlternative) };
}

function parseAlternative(alt: string): GlobSegment[] {
  const raw = alt.split('/');
  const out: GlobSegment[] = [];
  raw.forEach((segment, i) => {
    if (segment.includes('**')) {
      if (segment !== '**') fail('** must be a whole segment, outside {…} (use * in a segment)');
      if (out.at(-1)?.k === 'globstar') return; // picomatch collapses `**/**`
      const before = raw[i - 1] ?? '';
      const trailing = raw.slice(i + 1).every((s) => s === '**');
      const min1 = trailing && (before.endsWith('*') || before.endsWith(LED));
      out.push({ k: 'globstar', min1 });
      return;
    }
    const tokens = tokenize(segment, alt);
    const guarded = segment.includes(LED);
    const literal = tokens.every((t) => t.k === 'lit')
      ? tokens.map((t) => (t.k === 'lit' ? t.ch : '')).join('')
      : null;
    const matchesEmpty = segment !== '' && !guarded && tokens.every((t) => t.k === 'star');
    out.push({ k: 'segment', tokens, literal, guarded, matchesEmpty });
  });
  return out;
}

function tokenize(segment: string, alt: string): GlobToken[] {
  const tokens: GlobToken[] = [];
  for (let i = 0; i < segment.length; i += 1) {
    const c = segment[i]!;
    if (c === MARK) continue;
    if (c === '*' || c === LED) tokens.push({ k: 'star' });
    else if (c === '?') tokens.push({ k: 'one' });
    else if (c === '[') {
      const end = segment.indexOf(']', i + 1);
      if (end === -1) {
        if (alt.includes(']')) fail('a [...] class cannot span /');
        tokens.push({ k: 'lit', ch: c });
        continue;
      }
      tokens.push(parseClass(segment.slice(i + 1, end)));
      i = end;
    } else tokens.push({ k: 'lit', ch: c });
  }
  return tokens;
}

/** Characters picomatch treats as regex syntax inside a class body. */
const CLASS_SPECIAL = /[-*+?.^${}(|)[\]]/;

function parseClass(body: string): GlobToken {
  if (body === '') fail('empty [] class');
  if (body.startsWith('!')) fail('[!...] is not a negation here; use [^...]');
  if (body.includes('[')) fail('POSIX [:classes:] and nested [ are not supported');
  const negated = body.startsWith('^');
  const members = negated ? body.slice(1) : body;
  if (members === '') fail('empty [^] class');
  const ranges: Array<readonly [string, string]> = [];
  for (let i = 0; i < members.length; i += 1) {
    const lo = members[i]!;
    const hi = members[i + 2];
    if (members[i + 1] === '-' && hi !== undefined) {
      if (hi < lo) fail(`class range out of order: ${lo}-${hi}`);
      ranges.push([lo, hi]);
      i += 2;
    } else ranges.push([lo, lo]);
  }
  const inSet = (c: string): boolean => ranges.some(([lo, hi]) => c >= lo && c <= hi);
  // picomatch also matches the bracket text literally when the body is plain.
  const literal = CLASS_SPECIAL.test(body) ? null : `[${body}]`;
  return { k: 'class', test: negated ? (c) => c !== '/' && !inSet(c) : inSet, literal };
}
