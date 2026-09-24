/**
 * Raw-pattern passes for glob-parse.ts: star marking and `{a,b}` expansion.
 * Sentinels are control characters, which glob-parse.ts rejects in input.
 */

/** Brace boundary, so `{*,a}*` expands to two stars instead of a globstar. */
export const MARK = '\u0000';
/** A `*` picomatch guards: it never matches a `.`/`..` segment (see glob-safety). */
export const LED = '\u0001';

const MAX_EXPANSIONS = 64;

export function fail(reason: string): never {
  throw new Error(reason);
}

/** Index just past a `[...]` class starting at `i`, or `i + 1` when unclosed. */
function skipClass(s: string, i: number): number {
  const end = s.indexOf(']', i + 1);
  return end === -1 ? i + 1 : end + 1;
}

/**
 * Replace each guarded `*` with {@link LED}: a star that starts a segment, or
 * follows a segment-leading `.`, outside any class. picomatch adds its dot guard
 * by the token before the star, so a star right after `{`, `,` or `}` is plain.
 */
export function markLedStars(body: string): string {
  let out = '';
  let depth = 0;
  for (let i = 0; i < body.length; ) {
    const c = body[i]!;
    if (c === '[') {
      const end = skipClass(body, i);
      out += body.slice(i, end);
      i = end;
      continue;
    }
    if (c === '{') depth += 1;
    if (c === '}' && depth > 0) depth -= 1;
    const prev = body[i - 1];
    if (c === '*' && prev === '.' && depth > 0) fail('.* inside {…} is not supported');
    const segmentStart = i === 0 || prev === '/';
    const afterLeadingDot = prev === '.' && (i === 1 || body[i - 2] === '/');
    const led =
      c === '*' && body[i + 1] !== '*' && prev !== '*' && (segmentStart || afterLeadingDot);
    out += led ? LED : c;
    i += 1;
  }
  return out;
}

/** Expand `{a,b}` groups (nested allowed) into at most 64 plain alternatives. */
export function expandBraces(s: string): string[] {
  let open = -1;
  for (let i = 0; i < s.length && open === -1; ) {
    if (s[i] === '[') i = skipClass(s, i);
    else if (s[i] === '}') fail('unbalanced }');
    else if (s[i] === '{') open = i;
    else i += 1;
  }
  if (open === -1) return [s];
  const options: string[] = [];
  let depth = 0;
  let start = open + 1;
  let close = -1;
  for (let i = open + 1; i < s.length && close === -1; ) {
    const c = s[i];
    if (c === '[') {
      i = skipClass(s, i);
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}' && depth > 0) depth -= 1;
    else if (c === '}') close = i;
    else if (c === ',' && depth === 0) {
      options.push(s.slice(start, i));
      start = i + 1;
    }
    i += 1;
  }
  if (close === -1) fail('unclosed {');
  if (options.length === 0)
    fail('brace groups need a comma, e.g. {a,b} (ranges are not supported)');
  options.push(s.slice(start, close));
  const suffixes = expandBraces(s.slice(close + 1));
  const out: string[] = [];
  for (const option of options) {
    for (const head of expandBraces(option)) {
      for (const tail of suffixes) {
        out.push(s.slice(0, open) + MARK + head + MARK + tail);
        if (out.length > MAX_EXPANSIONS) fail(`more than ${MAX_EXPANSIONS} brace expansions`);
      }
    }
  }
  return out;
}
