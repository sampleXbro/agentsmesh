import { describe, expect, it } from 'vitest';
import {
  nextStaleTargets,
  parseStaleTargets,
} from '../../../src/config/core/lock-stale-targets.js';

describe('parseStaleTargets', () => {
  it('keeps the string entries of a list and drops an empty or wrong value', () => {
    expect([
      parseStaleTargets(['cursor', 3, 'claude-code']),
      parseStaleTargets([]),
      parseStaleTargets('cursor'),
      parseStaleTargets(undefined),
    ]).toEqual([['cursor', 'claude-code'], undefined, undefined, undefined]);
  });
});

describe('nextStaleTargets', () => {
  it('marks every skipped target stale when the sources changed', () => {
    expect(nextStaleTargets(undefined, ['zed', 'cursor'], true)).toEqual(['cursor', 'zed']);
  });

  it('keeps only already-stale targets that were skipped again when nothing changed', () => {
    expect(nextStaleTargets(['cursor', 'zed'], ['zed', 'amp'], false)).toEqual(['zed']);
  });

  it('is empty (undefined) after a full run', () => {
    expect(nextStaleTargets(['cursor'], [], true)).toBeUndefined();
  });
});
