import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import {
  getGlobMatcher,
  isSafeGlobPattern,
  MAX_GLOB_LENGTH,
  MAX_GLOB_PATH_LENGTH,
  unsafeGlobReason,
} from '../../../src/lessons/glob-safety.js';

function matches(pattern: string, path: string): boolean {
  const matcher = getGlobMatcher(pattern);
  if (matcher === null) throw new Error(`pattern rejected: ${pattern}`);
  return matcher.test(path);
}

function timeMs(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

describe('getGlobMatcher — legitimate globs keep picomatch({ dot: true }) semantics', () => {
  it.each([
    ['src/**/*.ts', 'src/a/b/c.ts', true],
    ['src/**/*.ts', 'src/c.ts', true],
    ['src/**/*.ts', 'lib/c.ts', false],
    ['src/**/*.ts', 'src/c.tsx', false],
    ['**/*.md', 'README.md', true],
    ['**/*.md', 'docs/a/b.md', true],
    ['**/*.md', '.changeset/x.md', true],
    ['.github/workflows/*.yml', '.github/workflows/ci.yml', true],
    ['.github/workflows/*.yml', '.github/workflows/sub/ci.yml', false],
    ['src/{a,b}/**', 'src/a/x.ts', true],
    ['src/{a,b}/**', 'src/b', true],
    ['src/{a,b}/**', 'src/c/x.ts', false],
    ['*.{ts,tsx}', 'a.tsx', true],
    ['src/targets/*/{hooks-format,importer}.ts', 'src/targets/claude-code/importer.ts', true],
    ['src/targets/*/{hooks-format,importer}.ts', 'src/targets/claude-code/linter.ts', false],
    ['**', '.env', true],
    ['*', '.env', true],
    ['.env*', '.env.local', true],
    ['./src/x.ts', 'src/x.ts', true],
    ['src/x.ts', 'src/x.ts', true],
    ['src/x.ts', 'src/y.ts', false],
    ['tests/**/*lessons*', 'tests/unit/lessons/lessons-a.test.ts', true],
    ['tests/**/*lessons*', 'tests/unit/lessons/a.test.ts', false],
    ['src/**', 'src', true],
    ['a/**/b', 'a/b', true],
    ['a?.ts', 'ab.ts', true],
    ['a?.ts', 'a/.ts', false],
    ['[a-c]x', 'bx', true],
    ['[a-c]x', 'dx', false],
    ['[^a]x', 'bx', true],
    ['[^a]x', 'ax', false],
    ['app/[slug]/page.tsx', 'app/[slug]/page.tsx', true],
    ['app/[slug]/*', 'app/s/x', true],
    ['@scope/pkg/*.ts', '@scope/pkg/a.ts', true],
    ['c++/*.cc', 'c++/a.cc', true],
    ['!src/**', 'lib/a.ts', true],
    ['!src/**', 'src/a.ts', false],
    ['**/x.ts', '../x.ts', false],
    ['../**', '../a/b', true],
    ['a/*/b', 'a/../b', false],
    ['A.ts', 'a.ts', false],
  ])('%s vs %s -> %s', (pattern, path, expected) => {
    expect(matches(pattern, path)).toBe(expected);
  });

  it('never matches an empty or over-long path', () => {
    expect(matches('**', '')).toBe(false);
    expect(matches('**', 'a/'.repeat(MAX_GLOB_PATH_LENGTH))).toBe(false);
  });
});

describe('unsafeGlobReason — globs outside the linear subset are rejected (fail closed)', () => {
  it.each([
    ['**/' + '+(*)'.repeat(12) + 'ZZZ'],
    ['(a+)+b'],
    ['a|b'],
    ['*.+(ts|tsx)'],
    ['@(a|b)'],
    ['!(x)'],
    ['**.ts'],
    ['src/**x/y'],
    ['***'],
    [''],
    ['!'],
    ['!!src/**'],
    ['./!src/**'],
    ['{src/**,lib}/*.ts'],
    ['{a.*,b}'],
    ['src\\x.ts'],
    ['{1..5}.ts'],
    ['{a}'],
    ['a{b,c'],
    ['a}b'],
    ['[[:alpha:]]'],
    ['[!a]x'],
    ['[]a]'],
    ['[ab]+'],
    ['{a,b}+'],
    ['a"b"'],
    ['[z-a]'],
    ['[a/b]'],
    ['{a,b}'.repeat(7)],
    ['x'.repeat(MAX_GLOB_LENGTH + 1)],
  ])('rejects %j', (pattern) => {
    expect(unsafeGlobReason(pattern)).toEqual(expect.any(String));
    expect(isSafeGlobPattern(pattern)).toBe(false);
    expect(getGlobMatcher(pattern)).toBeNull();
  });

  it('accepts a pattern at the length cap', () => {
    expect(isSafeGlobPattern('x'.repeat(MAX_GLOB_LENGTH))).toBe(true);
  });

  it('allows parentheses and pipes only inside a bracket class (literal)', () => {
    expect(matches('app/[(]auth[)]/page.tsx', 'app/(auth)/page.tsx')).toBe(true);
    expect(matches('a[|]b', 'a|b')).toBe(true);
  });
});

describe('getGlobMatcher — cost is bounded (no catastrophic backtracking)', () => {
  it('rejects the nested-extglob repro in well under a millisecond budget', () => {
    const hostile = '**/' + '+(*)'.repeat(20) + 'ZZZ';
    expect(timeMs(() => expect(getGlobMatcher(hostile)).toBeNull())).toBeLessThan(20);
  });

  it('matches a star-heavy glob against a long segment in linear time', () => {
    const pattern = '*a'.repeat(40) + 'b';
    const path = 'a'.repeat(4000);
    // picomatch needs minutes here (backtracking over 40 stars).
    expect(timeMs(() => expect(matches(pattern, path)).toBe(false))).toBeLessThan(100);
  });

  it('matches a globstar-heavy glob against a deep path in bounded time', () => {
    const pattern = '**/*a*/'.repeat(20) + 'z';
    const path = 'a/'.repeat(2000) + 'b';
    expect(timeMs(() => expect(matches(pattern, path)).toBe(false))).toBeLessThan(100);
  });

  it('bounds the work of many near-cap brace expansions', () => {
    const pattern = '{*a,*b}'.repeat(6) + 'z';
    const path = 'ab'.repeat(2000);
    expect(timeMs(() => expect(matches(pattern, path)).toBe(false))).toBeLessThan(100);
  });

  it('charges a shared budget and reports a non-match once it is exhausted', () => {
    const matcher = getGlobMatcher('src/**/*.ts');
    expect(matcher).not.toBeNull();
    const budget = { remaining: 1_000_000 };
    expect(matcher!.test('src/a/b.ts', budget)).toBe(true);
    expect(budget.remaining).toBeLessThan(1_000_000);
    expect(matcher!.test('src/a/b.ts', { remaining: 0 })).toBe(false);
  });
});
