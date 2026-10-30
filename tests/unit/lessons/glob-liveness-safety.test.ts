/**
 * Recall's glob matcher is linear, but validate, prune, capture guardrails and
 * the effectiveness view matched the same author-supplied globs with picomatch,
 * which runs some patterns as a backtracking regex. A hostile graph could then
 * stall `validate`, capture, or the hook through the effectiveness view.
 * Every glob path must use the safe matcher and treat an unsafe glob as a
 * non-match, never as proof that its file was removed.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createActionMatcher } from '../../../src/lessons/action-match.js';
import { missingGlobState } from '../../../src/lessons/file-glob-liveness.js';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import { fileGlobLiveness, fileGlobMatchCount } from '../../../src/lessons/validate-liveness.js';

/** Globs the safe matcher was asked for and rejected (returned null), in order. */
const rejected = vi.hoisted((): string[] => []);

vi.mock('../../../src/lessons/glob-safety.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../src/lessons/glob-safety.js')>();
  return {
    ...real,
    getGlobMatcher: (pattern: string): ReturnType<typeof real.getGlobMatcher> => {
      const matcher = real.getGlobMatcher(pattern);
      if (matcher === null) rejected.push(pattern);
      return matcher;
    },
  };
});

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

describe('non-recall glob paths use the safe matcher', () => {
  beforeEach(() => {
    rejected.length = 0;
  });

  // The safe matcher rejects the glob at parse time, so it never runs.
  it('fileGlobMatchCount counts an unsafe glob as matching nothing', () => {
    expect(fileGlobMatchCount(HOSTILE, PATHS)).toBe(0);
    expect(rejected).toEqual([HOSTILE]);
  });

  it('fileGlobLiveness never calls an unsafe glob dead', () => {
    expect([...fileGlobLiveness(graph(HOSTILE), PATHS).dead]).toEqual([]);
    expect(rejected).toEqual([HOSTILE]);
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
    expect(matches('l', 'file:src/dir1/file-1-aaaaaaaaaa.ts')).toBe(false);
    expect(rejected).toEqual([HOSTILE]);
  });

  it('safe globs keep their picomatch meaning', () => {
    expect(fileGlobMatchCount('src/**/*.ts', PATHS)).toBe(50);
    expect(createActionMatcher(graph('src/**'))('l', 'file:src/x.ts')).toBe(true);
  });
});
