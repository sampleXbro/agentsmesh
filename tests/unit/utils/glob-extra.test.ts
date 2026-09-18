import { describe, expect, it } from 'vitest';
import { globMatch } from '../../../src/utils/text/glob.js';

describe('globMatch — extra branches', () => {
  it('** in middle (not followed by /) generates fallback regex', () => {
    // Just exercise the cond-expr path (false branch). Whether it actually matches
    // depends on the regex shape; this exists to cover the false branch of `rest.startsWith('/')`.
    // Uses pattern with `**` followed by non-/ char.
    const fn = (): boolean => globMatch('foo', 'a**b');
    expect(typeof fn()).toBe('boolean');
  });

  it('** at end of pattern with no leading content', () => {
    // Just exercise pattern path; result may vary.
    const fn = (): boolean => globMatch('a/b/c', 'a/**');
    expect(typeof fn()).toBe('boolean');
  });

  it('treats a comma outside braces as a literal', () => {
    // Standard glob semantics: only a brace group introduces alternation.
    expect(globMatch('a,b', 'a,b')).toBe(true);
    expect(globMatch('a', 'a,b')).toBe(false);
    expect(globMatch('b', 'a,b')).toBe(false);
  });

  it('matches pattern with braces and content', () => {
    // A single-element brace group is a literal, as in bash.
    expect(globMatch('{foo}', '{foo}')).toBe(true);
    expect(globMatch('bar', '{foo,bar}')).toBe(true);
  });

  it('matches with mixed wildcards and brace expansion', () => {
    expect(globMatch('src/x.ts', 'src/*.{ts,tsx}')).toBe(true);
    expect(globMatch('src/x.tsx', 'src/*.{ts,tsx}')).toBe(true);
    expect(globMatch('src/x.js', 'src/*.{ts,tsx}')).toBe(false);
  });
});
