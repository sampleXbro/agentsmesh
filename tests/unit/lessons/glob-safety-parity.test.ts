import picomatch from 'picomatch';
import { describe, expect, it } from 'vitest';
import { getGlobMatcher } from '../../../src/lessons/glob-safety.js';

/**
 * Differential check: inside the supported subset the linear glob matcher must
 * agree with the picomatch({ dot: true }) semantics recall used before, on the
 * path shapes recall produces (project-relative, forward-slash, optionally a
 * leading `../` chain for files outside the project).
 */

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PATTERN_PIECES = [
  'a',
  'b',
  'ab',
  '.',
  '.a',
  'x.ts',
  '*',
  '?',
  '[ab]',
  '[a-b]',
  '[^b]',
  '[.]',
  '*.*',
  '{a,b}',
  '{,a}',
  '{a,.b}',
  '{a,b/c}',
  '{a,{b,.}}',
  '{*,a}',
  '{a,*}',
  '{a/*,b}',
  '{**/a,b}',
  '*.',
  '.*',
  'a*',
  '*a',
  '/',
  '+',
  '@',
  '$',
  '#',
  '!',
  ',',
  '}',
];
const PATH_SEGMENTS = [
  'a',
  'b',
  'ab',
  '.a',
  'a.b',
  'ba',
  'x.ts',
  'c',
  '.b.ts',
  'a+b',
  'a.',
  '[ab]',
  'a,b',
  '{a,b}',
];

function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)]!;
}

function randomPattern(rand: () => number): string {
  const segments: string[] = [];
  const count = 1 + Math.floor(rand() * 4);
  for (let i = 0; i < count; i += 1) {
    if (rand() < 0.2) {
      segments.push('**');
      continue;
    }
    let segment = '';
    const pieces = 1 + Math.floor(rand() * 3);
    for (let j = 0; j < pieces; j += 1) segment += pick(rand, PATTERN_PIECES);
    segments.push(segment);
  }
  const prefix = rand() < 0.1 ? '!' : rand() < 0.1 ? './' : rand() < 0.05 ? '../' : '';
  return prefix + segments.join('/');
}

function randomPath(rand: () => number): string {
  const segments: string[] = [];
  const count = 1 + Math.floor(rand() * 4);
  for (let i = 0; i < count; i += 1) segments.push(pick(rand, PATH_SEGMENTS));
  return (rand() < 0.15 ? '../' : '') + segments.join('/');
}

describe('glob-safety parity with picomatch({ dot: true })', () => {
  it('agrees on every supported pattern across random well-formed paths', () => {
    const rand = mulberry32(0x5eed);
    const mismatches: string[] = [];
    let compared = 0;
    for (let p = 0; p < 3000; p += 1) {
      const pattern = randomPattern(rand);
      const ours = getGlobMatcher(pattern);
      if (ours === null) continue;
      const theirs = picomatch(pattern, { dot: true });
      for (let q = 0; q < 12; q += 1) {
        const path = randomPath(rand);
        compared += 1;
        if (ours.test(path) !== theirs(path)) {
          mismatches.push(`${pattern} vs ${path}: ours=${ours.test(path)}`);
        }
      }
    }
    expect(compared).toBeGreaterThan(10_000);
    expect(mismatches.slice(0, 20)).toEqual([]);
  });

  it('agrees on paths that literally equal a supported pattern', () => {
    for (const pattern of ['a/[b]/c', 'x/{a,b}', 'x/?', 'x/*']) {
      expect(getGlobMatcher(pattern)!.test(pattern)).toBe(
        picomatch(pattern, { dot: true })(pattern),
      );
    }
  });
});
