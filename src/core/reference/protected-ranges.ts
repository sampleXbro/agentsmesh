/**
 * Byte ranges that must never be read as filesystem paths: URLs and other
 * protected schemes, fenced code blocks, managed blocks — and, for the link
 * validator only, inline code spans.
 */

import { getLinkFormatRegistry } from './link-format-registry.js';

const FENCED_CODE_BLOCK = /^(?:```|~~~)[^\n]*\n[\s\S]*?^(?:```|~~~)/gm;
const ROOT_GENERATION_CONTRACT_BLOCK =
  /<!-- agentsmesh:root-generation-contract:start -->[\s\S]*?<!-- agentsmesh:root-generation-contract:end -->/g;
const EMBEDDED_RULES_BLOCK =
  /<!-- agentsmesh:embedded-rules:start -->[\s\S]*?<!-- agentsmesh:embedded-rules:end -->/g;

/**
 * Byte ranges of inline code spans (`` `x` ``, ``` ``x`` ```).
 *
 * A code span closes on the next backtick run of the same length, per
 * CommonMark; an unpaired run opens nothing. Kept separate from
 * `protectedRanges` on purpose: the rewriter deliberately DOES rebase a path
 * written inside backticks, while the link validator must not read
 * documentation of link syntax as a real link.
 */
export function inlineCodeRanges(content: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let openStart = -1;
  let openLength = 0;
  for (const match of content.matchAll(/`+/g)) {
    const start = match.index;
    const length = match[0].length;
    if (openStart === -1) {
      openStart = start;
      openLength = length;
      continue;
    }
    if (length === openLength) {
      ranges.push([openStart, start + length]);
      openStart = -1;
      openLength = 0;
    }
    // A run of a different length is content inside the open span.
  }
  return ranges;
}

/**
 * Extend a protected URL span across parenthesised path segments.
 *
 * The scheme patterns stop at `(` so a markdown link's own closing paren is
 * never swallowed, which truncated any URL with parentheses in its path — a
 * Next.js route group such as `apps/(marketing)/package.json` lost the
 * separator and became `apps/(marketing)package.json`. Absorbing only
 * *balanced* groups, then the ordinary URL characters that follow, keeps the
 * markdown delimiter outside the span.
 */
function extendAcrossBalancedParens(content: string, end: number): number {
  let cursor = end;
  while (content[cursor] === '(') {
    let depth = 0;
    let scan = cursor;
    while (scan < content.length) {
      const ch = content[scan];
      if (ch === '(') depth += 1;
      else if (ch === ')') {
        depth -= 1;
        if (depth === 0) break;
      } else if (ch === undefined || /\s/.test(ch)) return cursor;
      scan += 1;
    }
    if (depth !== 0) return cursor;
    cursor = scan + 1;
    while (cursor < content.length && !/[\s<>()\]]/.test(content.charAt(cursor))) cursor += 1;
  }
  return cursor;
}

export function protectedRanges(content: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const pattern of getLinkFormatRegistry().protectedSchemes) {
    // Plugin-supplied schemes may omit the global flag; matchAll requires it.
    const globalPattern = pattern.flags.includes('g')
      ? pattern
      : new RegExp(pattern.source, `${pattern.flags}g`);
    for (const match of content.matchAll(globalPattern)) {
      const start = match.index;
      ranges.push([start, extendAcrossBalancedParens(content, start + match[0].length)]);
    }
  }
  for (const match of content.matchAll(FENCED_CODE_BLOCK)) {
    ranges.push([match.index, match.index + match[0].length]);
  }
  for (const match of content.matchAll(ROOT_GENERATION_CONTRACT_BLOCK)) {
    ranges.push([match.index, match.index + match[0].length]);
  }
  for (const match of content.matchAll(EMBEDDED_RULES_BLOCK)) {
    ranges.push([match.index, match.index + match[0].length]);
  }
  return ranges;
}
