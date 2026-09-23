/** Helpers for {@link parseRegex}: bounded-repeat expansion and escape handling. */

import { type AstNode, UnsupportedRegexError } from './ast.js';

export const MAX_REPEAT = 1000;

export const isWord = (c: string): boolean => /[A-Za-z0-9_]/.test(c);

/** Expand `{min,max}` into required copies + optional/star copies (linear-engine has no counted repeat). */
export function expandRepeat(atom: AstNode, min: number, max: number): AstNode {
  const items: AstNode[] = [];
  for (let k = 0; k < min; k += 1) items.push(atom);
  if (max === Infinity) {
    items.push({ k: 'star', node: atom });
  } else {
    for (let k = min; k < max; k += 1) items.push({ k: 'opt', node: atom });
  }
  if (items.length === 0) return { k: 'empty' };
  return items.length === 1 ? items[0]! : { k: 'concat', items };
}

/** Predicate for a class escape (`\d \w \s` …); null when the escape is a literal. */
export function escapeClass(c: string): ((c: string) => boolean) | null {
  switch (c) {
    case 'd':
      return (x) => x >= '0' && x <= '9';
    case 'D':
      return (x) => !(x >= '0' && x <= '9');
    case 'w':
      return isWord;
    case 'W':
      return (x) => !isWord(x);
    case 's':
      return (x) => /\s/.test(x);
    case 'S':
      return (x) => !/\s/.test(x);
    default:
      return null;
  }
}

const HEX2 = /^[0-9a-fA-F]{2}$/;
const HEX4 = /^[0-9a-fA-F]{4}$/;

/**
 * Read a `\xHH` / `\uHHHH` escape. `i` points AFTER the escape letter `c`
 * (`x` or `u`); returns the decoded char and how many EXTRA chars to consume.
 * Falls back to the literal letter (len 0) when the hex form is malformed — this
 * matches `new RegExp` WITHOUT the `u` flag (how lessons compile patterns), where
 * `\x`/`\u` not followed by valid hex is the literal `x`/`u`. `\u{…}` is
 * rejected (fail closed): it reads as a code point but, without the `u` flag,
 * matches the literal text `u{…}`.
 */
export function readUnicodeEscape(src: string, i: number, c: string): { ch: string; len: number } {
  if (c === 'u' && src[i] === '{') {
    throw new UnsupportedRegexError('\\u{…} code point escapes are not supported; use \\uHHHH');
  }
  if (c === 'x') {
    const hex = src.slice(i, i + 2);
    return HEX2.test(hex)
      ? { ch: String.fromCharCode(parseInt(hex, 16)), len: 2 }
      : { ch: 'x', len: 0 };
  }
  const hex = src.slice(i, i + 4);
  return HEX4.test(hex)
    ? { ch: String.fromCharCode(parseInt(hex, 16)), len: 4 }
    : { ch: 'u', len: 0 };
}

/**
 * Read a `\cX` control escape (`\cA` → U+0001 … `\cZ` → U+001A). `i` points AFTER
 * the `c`. `\c` NOT followed by a letter is rejected (fail closed) rather than
 * silently diverging — `new RegExp` without the `u` flag treats `\c1` as the
 * literal `\c1`, which the linear engine does not reproduce.
 */
export function readControlEscape(src: string, i: number): { ch: string; len: number } {
  const x = src[i];
  if (x === undefined || !/[A-Za-z]/.test(x)) {
    throw new UnsupportedRegexError('\\c must be followed by a letter');
  }
  return { ch: String.fromCharCode(x.charCodeAt(0) & 0x1f), len: 1 };
}

/**
 * The character an escape stands for INSIDE a character class. Unlike outside a
 * class, `\b` is a backspace (U+0008), not a word boundary. `i` points after `e`.
 */
export function classEscapeChar(src: string, i: number, e: string): { ch: string; len: number } {
  if (e === 'b') return { ch: '\b', len: 0 };
  if (e === 'c') return readControlEscape(src, i);
  if (e === 'x' || e === 'u') return readUnicodeEscape(src, i, e);
  return { ch: escapeLiteral(e), len: 0 };
}

/** The literal character an escape stands for (`\t`, `\n`, …, or the char itself). */
export function escapeLiteral(c: string): string {
  switch (c) {
    case 't':
      return '\t';
    case 'n':
      return '\n';
    case 'r':
      return '\r';
    case 'f':
      return '\f';
    case 'v':
      return '\v';
    case '0':
      return '\0';
    default:
      return c; // \. \/ \( … → the literal character
  }
}
