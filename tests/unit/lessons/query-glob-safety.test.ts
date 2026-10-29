import { describe, expect, it, vi } from 'vitest';
import type { LessonsGraph, Trigger } from '../../../src/lessons/graph-schema.js';
import {
  collectMatchedTriggersByKind,
  GLOB_MATCH_BUDGET,
  queryLessons,
} from '../../../src/lessons/query.js';
import { timed } from '../../helpers/timing.js';

/** DP cells the glob matcher spent, counted from the work it charges itself. */
const globWork = vi.hoisted(() => ({ cells: 0 }));

vi.mock('../../../src/lessons/glob-dp.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../src/lessons/glob-dp.js')>();
  return {
    ...real,
    matchSegments: (...args: Parameters<typeof real.matchSegments>): boolean => {
      const work = args[2];
      const before = work.remaining;
      try {
        return real.matchSegments(...args);
      } finally {
        globWork.cells += before - work.remaining;
      }
    },
  };
});

const HOSTILE_EXTGLOB = '**/' + '+(*)'.repeat(12) + 'ZZZ';

function graphWith(triggers: Record<string, Trigger>): LessonsGraph {
  const lessons: LessonsGraph['lessons'] = {};
  for (const id of Object.keys(triggers)) {
    lessons[`lesson-${id}`] = {
      rule: `Rule for ${id}.`,
      topics: ['t'],
      triggers: [id],
      evidence: [],
      status: 'active',
      createdAt: '2026-06-01',
    };
  }
  return { version: 2, lessons, topics: { t: { summary: 'T' } }, triggers };
}

describe('queryLessons — file_glob matching cannot be slowed by a hostile graph', () => {
  it('treats the nested-extglob repro as a non-match and stays fast', () => {
    const graph = graphWith({
      't-hostile': { kind: 'file_glob', pattern: HOSTILE_EXTGLOB },
      't-legit': { kind: 'file_glob', pattern: 'src/**/*.ts' },
    });
    // Before the fix this single call took ~5 s (exponential in the repeat count).
    const { value: ids, ms } = timed(() =>
      queryLessons(graph, { file: 'src/index.ts' }).map((m) => m.id),
    );
    expect(ids).toEqual(['lesson-t-legit']);
    expect(ms).toBeLessThan(50);
  });

  it('does not match a hostile glob even on a path that would satisfy it literally', () => {
    const graph = graphWith({ 't-hostile': { kind: 'file_glob', pattern: '(a|aa)+b' } });
    const matched = collectMatchedTriggersByKind(graph, { file: 'aab' });
    expect([...matched.file_glob]).toEqual([]);
  });

  it('bounds total glob work across many near-cap star-heavy triggers', () => {
    // Legit trigger first: once the shared budget is spent, later globs degrade
    // to non-matches (never a false positive), mirroring command patterns.
    const triggers: Record<string, Trigger> = {
      't-legit': { kind: 'file_glob', pattern: '**/*.md' },
    };
    for (let i = 0; i < 200; i += 1) {
      triggers[`t-star-${i}`] = { kind: 'file_glob', pattern: `${'*a'.repeat(40)}*z${i}*.md` };
    }
    const graph = graphWith(triggers);
    globWork.cells = 0;
    const ids = queryLessons(graph, { file: `docs/${'a'.repeat(3000)}.md` }).map((m) => m.id);
    expect(ids).toEqual(['lesson-t-legit']);
    // Unshared, each star glob spends its own per-match cap: ~40M cells in all.
    // Counting cells, not ms, keeps this exact under any machine load.
    expect(globWork.cells).toBeGreaterThanOrEqual(GLOB_MATCH_BUDGET);
    expect(globWork.cells).toBeLessThan(GLOB_MATCH_BUDGET * 1.05);
  });
});
