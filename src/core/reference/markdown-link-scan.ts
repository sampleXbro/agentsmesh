/**
 * Shared markdown link scanner.
 *
 * Extracts markdown link destinations (`[t](p)`, `![t](p)`, `[id]: p`) from a
 * content string and exposes each match with its byte-offset and length so
 * downstream consumers can either classify links (install: scope/broken-link
 * prompt) or rewrite them in place (link rebaser, install apply-decisions).
 *
 * Fenced code blocks (``` / ~~~) are protected: link patterns inside fences
 * are not extracted. GFM footnote definitions (`[^1]: text`) are skipped —
 * they share the reference-definition shape but carry prose, not a destination. Inline code spans and HTML comments are intentionally
 * not protected — downstream classifiers handle pathological markdown by
 * falling through to a "leave with warning" path rather than crashing.
 *
 * Scope: this module owns the *parsing* primitive. It does not classify
 * destinations as URLs, anchors, or relative paths — that is the consumer's
 * job (`scan-relative-links.ts` for install, the rebaser's protected-range
 * logic for generate/import).
 */

export type MarkdownLinkKind = 'inline' | 'image' | 'reference-def';

export interface MarkdownLinkToken {
  /** Inline (`[t](p)`), image (`![t](p)`), or reference-def (`[id]: p`). */
  readonly kind: MarkdownLinkKind;
  /** Destination as written, with `<...>` and title suffix stripped (anchor preserved). */
  readonly destination: string;
  /** Reference id for `reference-def`; undefined otherwise. */
  readonly label?: string;
  /** Offset of the destination inside the original content. */
  readonly destinationOffset: number;
  /** Length of the destination span inside the original content. */
  readonly destinationLength: number;
}

const FENCED_BLOCK = /^(?:```|~~~)[^\n]*\n[\s\S]*?^(?:```|~~~)/gm;
// `d` (hasIndices): we read the destination group's exact start offset rather
// than searching for `(` — a label containing `(` would otherwise misplace the
// span and corrupt offset-based rewrites.
const INLINE_LINK = /(!?)\[[^\]\n]*\]\(([^)\n]+)\)/dg;
const REFERENCE_DEF = /^\s*\[([^\]\n]+)\]:\s*(.+?)\s*$/dgm;

/** Return fenced code-block byte ranges (`[start, end)`). */
export function getFencedCodeRanges(content: string): Array<readonly [number, number]> {
  const ranges: Array<readonly [number, number]> = [];
  for (const match of content.matchAll(FENCED_BLOCK)) {
    const start = match.index ?? 0;
    ranges.push([start, start + match[0].length]);
  }
  return ranges;
}

function isInRanges(offset: number, ranges: ReadonlyArray<readonly [number, number]>): boolean {
  for (const [start, end] of ranges) {
    if (offset >= start && offset < end) return true;
  }
  return false;
}

/**
 * Locate the bare destination path within a raw destination string, returning
 * its `[start, length)` span relative to `raw`. Excludes surrounding whitespace,
 * an optional `"title"`/`'title'` suffix, and a wrapping `<...>`. Returning a
 * span (not just the string) lets callers compute an offset-accurate rewrite
 * range that touches only the path and preserves any title.
 */
function destPathSpan(raw: string): { start: number; length: number } {
  const leading = raw.length - raw.trimStart().length;
  const inner = raw.trim();
  let length = inner.length;
  const titleMatch = /^(.*?)\s+(["'])([\s\S]*?)\2\s*$/.exec(inner);
  if (titleMatch?.[1] !== undefined) length = titleMatch[1].trimEnd().length;
  let start = leading;
  const pathPart = inner.slice(0, length);
  if (pathPart.length >= 2 && pathPart.startsWith('<') && pathPart.endsWith('>')) {
    start += 1;
    length -= 2;
  }
  return { start, length };
}

/** The bare destination path: `"title"`/`'title'` suffix and `<...>` removed. */
function normalizeDestination(raw: string): string {
  const { start, length } = destPathSpan(raw);
  return raw.slice(start, start + length);
}

/**
 * Scan `content` for markdown link tokens. Each token carries the offset and
 * length of the destination span in the original content so callers can
 * perform exact-range rewrites without touching surrounding markdown.
 */
export function scanMarkdownLinks(content: string): readonly MarkdownLinkToken[] {
  const fenced = getFencedCodeRanges(content);
  const out: MarkdownLinkToken[] = [];

  for (const match of content.matchAll(INLINE_LINK)) {
    const idx = match.index ?? 0;
    if (isInRanges(idx, fenced)) continue;
    const isImage = match[1] === '!';
    const inner = match[2];
    const destSpan = match.indices?.[2];
    if (inner === undefined || destSpan === undefined) continue;
    const span = destPathSpan(inner);
    out.push({
      kind: isImage ? 'image' : 'inline',
      destination: normalizeDestination(inner),
      destinationOffset: destSpan[0] + span.start,
      destinationLength: span.length,
    });
  }

  for (const match of content.matchAll(REFERENCE_DEF)) {
    const idx = match.index ?? 0;
    if (isInRanges(idx, fenced)) continue;
    const label = (match[1] ?? '').trim();
    const rawDest = match[2] ?? '';
    const destSpan = match.indices?.[2];
    if (label === '' || rawDest.trim() === '' || destSpan === undefined) continue;
    // `[^1]: text` is a GFM footnote definition, not a link destination.
    if (label.startsWith('^')) continue;
    const span = destPathSpan(rawDest);
    out.push({
      kind: 'reference-def',
      destination: normalizeDestination(rawDest),
      label,
      destinationOffset: destSpan[0] + span.start,
      destinationLength: span.length,
    });
  }

  return out;
}

/**
 * Apply a set of exact-range rewrites to `content`. Each rewrite specifies a
 * byte range to replace and the replacement text. Ranges must not overlap.
 * Ranges are applied in descending offset order so earlier offsets remain
 * valid during application.
 */
export interface RangeRewrite {
  readonly offset: number;
  readonly length: number;
  readonly replacement: string;
}

export function applyRangeRewrites(content: string, rewrites: readonly RangeRewrite[]): string {
  if (rewrites.length === 0) return content;
  const sorted = [...rewrites].sort((a, b) => b.offset - a.offset);
  let out = content;
  for (const r of sorted) {
    out = `${out.slice(0, r.offset)}${r.replacement}${out.slice(r.offset + r.length)}`;
  }
  return out;
}
