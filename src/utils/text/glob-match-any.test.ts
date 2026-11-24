import { describe, it, expect } from 'vitest';
import { globMatchAny } from './glob.js';

describe('globMatchAny', () => {
  it('matches when any positive pattern matches', () => {
    expect(globMatchAny('.github/workflows/ci.yml', ['.github/**', 'mise.toml'])).toBe(true);
    expect(globMatchAny('mise.toml', ['.github/**', 'mise.toml'])).toBe(true);
  });

  it('does not match when only an exclusion would match', () => {
    expect(globMatchAny('skip.toml', ['!skip.toml'])).toBe(false);
  });

  it('* does not cross /', () => {
    expect(globMatchAny('a/b.txt', ['*'])).toBe(false);
    expect(globMatchAny('b.txt', ['*'])).toBe(true);
  });

  it('exact path does not match nested namesakes', () => {
    expect(globMatchAny('eslint.config.js', ['eslint.config.js'])).toBe(true);
    expect(globMatchAny('packages/app/eslint.config.js', ['eslint.config.js'])).toBe(false);
    expect(globMatchAny('packages/app/eslint.config.js', ['**/eslint.config.js'])).toBe(true);
  });

  it('! excludes even when a later positive would rematch', () => {
    expect(
      globMatchAny('eslint.config.local.js', [
        'eslint.config.local.js',
        '!eslint.config.local.js',
        'eslint.config.local.js',
      ]),
    ).toBe(false);
  });

  it('includes a folder via dir/**', () => {
    expect(globMatchAny('.github/workflows/ci.yml', ['.github/**'])).toBe(true);
    expect(globMatchAny('mise.toml', ['.github/**'])).toBe(false);
  });
});
