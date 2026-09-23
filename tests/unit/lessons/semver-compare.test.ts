import { describe, expect, it } from 'vitest';
import { compareSemver } from '../../../src/lessons/semver-compare.js';

describe('compareSemver', () => {
  it('orders by major, minor, then patch numerically', () => {
    expect(compareSemver('0.40.0', '0.9.0')).toBe(1);
    expect(compareSemver('1.2.3', '1.10.0')).toBe(-1);
    expect(compareSemver('2.0.0', '2.0.0')).toBe(0);
  });

  it('accepts a leading v and ignores build metadata', () => {
    expect(compareSemver('v1.2.3', '1.2.3+build.7')).toBe(0);
  });

  it('ranks a prerelease below its release', () => {
    expect(compareSemver('1.0.0-beta.1', '1.0.0')).toBe(-1);
    expect(compareSemver('1.0.0', '1.0.0-rc.1')).toBe(1);
  });

  it('compares prerelease identifiers per the semver spec', () => {
    expect(compareSemver('1.0.0-alpha', '1.0.0-alpha.1')).toBe(-1);
    expect(compareSemver('1.0.0-alpha.2', '1.0.0-alpha.10')).toBe(-1);
    expect(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta')).toBe(-1);
    expect(compareSemver('1.0.0-beta', '1.0.0-alpha')).toBe(1);
  });

  it('returns null when either side is not a version', () => {
    expect(compareSemver('unknown', '1.0.0')).toBeNull();
    expect(compareSemver('1.0.0', '')).toBeNull();
    expect(compareSemver('1.0', '1.0.0')).toBeNull();
  });
});
