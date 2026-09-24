import { MAX_RULE_LENGTH } from './graph-schema.js';

/**
 * Bounds for rule text on its way into an agent's context. A graph from a
 * cloned repo is untrusted input: a rule may be megabytes long, or carry line
 * breaks that fake the end of the recalled list and a "system" message after it.
 */

/** Delimiters of the fenced recalled-lessons block in hook output. */
export const RECALL_BLOCK_OPEN = '<recalled-lessons>';
export const RECALL_BLOCK_CLOSE = '</recalled-lessons>';

/** Total rule characters one CLI, MCP or hook answer may carry (~8k tokens). */
export const MAX_RECALL_PAYLOAD_CHARS = 32_000;

const TRUNCATION_MARK = ' …[truncated]';
const LINE_BREAKS = /\s*[\p{Cc}\p{Zl}\p{Zp}]+\s*/gu;
/** Invisible format characters: zero-width spaces and joiners, BOM, bidi controls. */
const FORMAT_CHARS = /\p{Cf}/gu;
/** `<` and its full-width and small forms. */
const LESS_THAN = /[<\uFF1C\uFE64]/gu;
/** What may sit between `<` and the tag name: spaces, slash look-alikes, combining marks. */
const TAG_GAP = /^[\s/\uFF0F\u2044\u2215\u29F8\p{M}]*/u;
/** The tag name, with dash look-alikes, after compatibility folding. */
const TAG_NAME = /^recalled[-\u2010-\u2015\u2212]lessons/iu;
/** Room for the tag name even when each letter takes two UTF-16 units. */
const TAG_WINDOW = 64;

/** UTF-16 index just past the first `count` characters (code points) of `text`. */
function codePointIndex(text: string, count: number): number {
  let index = 0;
  for (let seen = 0; seen < count && index < text.length; seen++) {
    const unit = text.charCodeAt(index);
    const next = text.charCodeAt(index + 1);
    index += unit >= 0xd800 && unit <= 0xdbff && next >= 0xdc00 && next <= 0xdfff ? 2 : 1;
  }
  return index;
}

/** Length in characters (code points), so an emoji counts once, not twice. */
export function codePointLength(text: string): number {
  return [...text].length;
}

/** Cut `rule` to at most `max` characters (code points), never inside a surrogate pair. */
export function clampText(rule: string, max: number = MAX_RULE_LENGTH): string {
  if (codePointIndex(rule, max) === rule.length) return rule;
  const end = codePointIndex(rule, Math.max(0, max - TRUNCATION_MARK.length));
  return rule.slice(0, end) + TRUNCATION_MARK;
}

/** True when `text` starts with the tag name, in any compatibility or accented spelling. */
function startsWithTagName(text: string): boolean {
  const gap = TAG_GAP.exec(text)?.[0].length ?? 0;
  const window = text
    .slice(gap, gap + TAG_WINDOW)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '');
  return TAG_NAME.test(window);
}

/**
 * `rule` as one clamped line: format characters are dropped, control characters
 * and line or paragraph separators become single spaces, and every `<` look-alike
 * that starts a spelling of the block tag becomes `‹`, so it cannot close the
 * fence early.
 */
export function safeRuleLine(rule: string, max: number = MAX_RULE_LENGTH): string {
  const oneLine = rule.replace(FORMAT_CHARS, '').replace(LINE_BREAKS, ' ').trim();
  const line = clampText(oneLine, max);
  return line.replace(LESS_THAN, (lt: string, offset: number) =>
    startsWithTagName(line.slice(offset + 1)) ? '‹' : lt,
  );
}

/**
 * Keep items in order while their summed size fits `max`. The first item is
 * always kept (it is already clamped), so an answer is never empty.
 */
export function capRulePayload<T>(
  items: readonly T[],
  size: (item: T) => number,
  max: number = MAX_RECALL_PAYLOAD_CHARS,
): { kept: T[]; dropped: number } {
  const kept: T[] = [];
  let used = 0;
  for (const item of items) {
    const cost = size(item);
    if (kept.length > 0 && used + cost > max) break;
    used += cost;
    kept.push(item);
  }
  return { kept, dropped: items.length - kept.length };
}
