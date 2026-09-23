/**
 * Recall's glob matcher is linear, but validate, prune, capture guardrails and
 * the effectiveness view matched the same author-supplied globs with picomatch,
 * which runs some patterns as a backtracking regex. A hostile graph could then
 * stall `validate`, capture, or the hook through the effectiveness view.
 * Every glob path must use the safe matcher and treat an unsafe glob as a
 * non-match, never as proof that its file was removed.
 */

import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { createActionMatcher } from '../../../src/lessons/action-match.js';
import { missingGlobState } from '../../../src/lessons/file-glob-liveness.js';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import { fileGlobLiveness, fileGlobMatchCount } from '../../../src/lessons/validate-liveness.js';

const HOSTILE = '**/' + '+(*)'.repeat(16) + 'ZZZ';
const PATHS = new Set(Array.from({ length: 50 }, (_, i) => `src/dir${i}/file-${i}-aaaaaaaaaa.ts`));

function graph(pattern: string): LessonsGraph {
  return {
    version: 2,
    topics: { t: { summary: 'T' } },
    triggers: { g: { kind: 'file_glob', pattern } },
    lessons: {
      l: {
        rule: 'r',
        topics: ['t'],
        triggers: ['g'],
        evidence: [],
        status: 'active',
        createdAt: '2026-01-01',
      },
    },
  };
}

function timed<T>(fn: () => T): { value: T; ms: number } {
  const start = performance.now();
  const value = fn();
  return { value, ms: performance.now() - start };
}

describe('non-recall glob paths use the safe matcher', () => {
  it('fileGlobMatchCount counts an unsafe glob as matching nothing, fast', () => {
    const { value, ms } = timed(() => fileGlobMatchCount(HOSTILE, PATHS));
    expect(value).toBe(0);
    expect(ms).toBeLessThan(100);
  });

  it('fileGlobLiveness never calls an unsafe glob dead', () => {
    const { value, ms } = timed(() => fileGlobLiveness(graph(HOSTILE), PATHS));
    expect([...value.dead]).toEqual([]);
    expect(ms).toBeLessThan(500);
  });

  it('missingGlobState keeps an unsafe glob pending even with history', () => {
    const history = {
      tracked: new Set<string>(),
      deleted: new Set([HOSTILE]),
      renamedAway: new Set(['src/a.ts']),
    };
    expect(missingGlobState(HOSTILE, history)).toBe('pending');
  });

  it('the effectiveness action matcher never matches an unsafe glob', () => {
    const matches = createActionMatcher(graph(HOSTILE));
    const { value, ms } = timed(() => matches('l', 'file:src/dir1/file-1-aaaaaaaaaa.ts'));
    expect(value).toBe(false);
    expect(ms).toBeLessThan(100);
  });

  it('safe globs keep their picomatch meaning', () => {
    expect(fileGlobMatchCount('src/**/*.ts', PATHS)).toBe(50);
    expect(createActionMatcher(graph('src/**'))('l', 'file:src/x.ts')).toBe(true);
  });
});
