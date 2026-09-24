import { describe, expect, it } from 'vitest';
import { getCommandMatcher, isSafeRegexPattern } from '../../../src/lessons/regex-safety.js';

/**
 * Command patterns run on the non-backtracking linear engine, so any pattern the
 * engine can compile is safe — including shapes that would ReDoS a backtracking
 * `RegExp` (`(a+)+`, `a+a+`, `a+b`). "Unsafe" now means only: the engine cannot
 * evaluate it (backreference / lookaround), it is invalid, or it is over-long.
 */

describe('isSafeRegexPattern', () => {
  it.each([
    'git commit',
    '^pnpm test:e2e',
    '(npm|pnpm) root -g',
    'https?://',
    'sed.*SKILL\\.md',
    '[a-z]+/[a-z]+',
    '\\d{2,4}-\\d+',
    // Shapes that ReDoS a backtracking engine but are linear here — accepted:
    '(a+)+$',
    '(a|aa)+$',
    'a+a+$',
    'a+b',
  ])('accepts engine-compilable pattern %j', (pattern) => {
    expect(isSafeRegexPattern(pattern)).toBe(true);
  });

  it.each([
    '(a)\\1', // backreference
    '\\k<n>x', // named backreference
    '(?=foo)bar', // lookahead
    '(?!foo)bar',
    '(?<=foo)bar', // lookbehind
    '(?<!foo)bar',
    '(', // invalid syntax
    'a{1,100000}', // repeat over the engine's bound
    '(){1000}'.repeat(5), // ε-chain that would overflow a recursive closure
    'a{1000}'.repeat(10), // NFA state amplification
    '\\u{1F600}', // code point escape: only means U+1F600 under the u flag
    'x[\\u{41}]', // …also inside a class
  ])('rejects pattern the engine cannot evaluate %j', (pattern) => {
    expect(isSafeRegexPattern(pattern)).toBe(false);
  });

  it('rejects an over-long pattern', () => {
    expect(isSafeRegexPattern('a'.repeat(1001))).toBe(false);
  });
});

describe('getCommandMatcher', () => {
  it('returns a working linear matcher for a supported pattern', () => {
    const m = getCommandMatcher('git\\s+commit');
    expect(m).not.toBeNull();
    expect(m!.test('git   commit')).toBe(true);
    expect(m!.test('git status')).toBe(false);
  });

  it('returns null for an unsupported pattern (recall treats it as a non-match)', () => {
    expect(getCommandMatcher('(?=x)y')).toBeNull();
    expect(getCommandMatcher('(a)\\1')).toBeNull();
  });

  it('returns null for an over-long pattern', () => {
    expect(getCommandMatcher('a'.repeat(1001))).toBeNull();
  });
});
