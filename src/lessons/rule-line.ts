import { MAX_RULE_LENGTH } from './graph-schema.js';

/**
 * Bounds for rule text on its way into an agent's context. A graph from a
 * cloned repo is untrusted input: a rule may be megabytes long, or carry line
 * breaks that fake the end of the recalled list and a "system" message after it.
 */

/** Delimiters of the fenced recalled-lessons block in hook output. */
export const RECALL_BLOCK_OPEN = '<recalled-lessons>';
export const RECALL_BLOCK_CLOSE = '</recalled-lessons>';

/** Total rule characters one CLI or MCP answer may carry (~8k tokens). */
export const MAX_RECALL_PAYLOAD_CHARS = 32_000;

const TRUNCATION_MARK = ' …[truncated]';
const LINE_BREAKS = /\s*[\p{Cc}\p{Zl}\p{Zp}]+\s*/gu;
const DELIMITER = /<(\s*\/?\s*recalled-lessons)/giu;

/** Cut `rule` to at most `max` characters, never inside a surrogate pair. */
export function clampText(rule: string, max: number = MAX_RULE_LENGTH): string {
  if (rule.length <= max) return rule;
  let end = Math.max(0, max - TRUNCATION_MARK.length);
  const last = rule.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return rule.slice(0, end) + TRUNCATION_MARK;
}

/**
 * `rule` as one clamped line: control characters and line or paragraph
 * separators become single spaces, and any spelling of the block delimiters
 * loses its `<` so it cannot close the fence early.
 */
export function safeRuleLine(rule: string, max: number = MAX_RULE_LENGTH): string {
  const oneLine = rule.replace(LINE_BREAKS, ' ').trim();
  return clampText(oneLine.replace(DELIMITER, '‹$1'), max);
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
