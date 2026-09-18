import { describe, it, expect } from 'vitest';
import { evaluateCase, runRecurrenceSuite } from '../../harness/lessons-recurrence/evaluate.js';
import type { Lesson, LessonsGraph, Trigger } from '../../../src/lessons/graph-schema.js';
import type { RecurrenceCase, RecurrenceSuite } from '../../harness/lessons-recurrence/types.js';

function lesson(triggers: string[], over: Partial<Lesson> = {}): Lesson {
  return {
    rule: 'rule',
    topics: ['t'],
    triggers,
    evidence: ['e'],
    status: 'active',
    createdAt: '2026-01-01',
    ...over,
  };
}

function graph(lessons: Record<string, Lesson>, triggers: Record<string, Trigger>): LessonsGraph {
  return { version: 1, lessons, topics: { t: { summary: 's' } }, triggers };
}

const FILE_GLOB = (pattern: string): Trigger => ({ kind: 'file_glob', pattern });

describe('evaluateCase', () => {
  it('classifies a clean discriminable retrieval in both directions', () => {
    const g = graph(
      { 'l-ts': lesson(['tf']), 'l-md': lesson(['tm']) },
      { tf: FILE_GLOB('src/**/*.ts'), tm: FILE_GLOB('**/*.md') },
    );
    const c: RecurrenceCase = {
      id: 'edit-ts',
      query: { file: 'src/a.ts' },
      shouldRetrieve: ['l-ts'],
      shouldNotRetrieve: ['l-md'],
    };
    const out = evaluateCase(g, c, 10);
    expect(out.retrieved).toEqual(['l-ts']);
    expect(out.truePositives).toEqual(['l-ts']);
    expect(out.falseNegatives).toEqual([]);
    expect(out.falsePositives).toEqual([]);
    expect(out.trueNegatives).toEqual(['l-md']);
  });

  it('DETECTS a false positive when two lessons share a broad glob', () => {
    const g = graph(
      { 'l-a': lesson(['broad']), 'l-b': lesson(['broad']) },
      { broad: FILE_GLOB('**/*.yaml') },
    );
    const out = evaluateCase(
      g,
      {
        id: 'edit-yaml',
        query: { file: 'x.yaml' },
        shouldRetrieve: ['l-a'],
        shouldNotRetrieve: ['l-b'],
      },
      10,
    );
    expect(out.retrieved).toEqual(['l-a', 'l-b']);
    expect(out.truePositives).toEqual(['l-a']);
    expect(out.falsePositives).toEqual(['l-b']);
  });

  it('never retrieves a deprecated lesson even when its trigger matches', () => {
    const g = graph(
      { 'l-old': lesson(['tf'], { status: 'deprecated' }), 'l-new': lesson(['tf']) },
      { tf: FILE_GLOB('src/**/*.ts') },
    );
    const out = evaluateCase(
      g,
      {
        id: 'edit-ts',
        query: { file: 'src/a.ts' },
        shouldRetrieve: ['l-new'],
        shouldNotRetrieve: ['l-old'],
      },
      10,
    );
    expect(out.retrieved).toEqual(['l-new']);
    expect(out.trueNegatives).toEqual(['l-old']);
  });

  it('respects top-N: truncated expected lessons become false negatives', () => {
    const g = graph(
      {
        'l-a': lesson(['broad'], { createdAt: '2026-03-01' }),
        'l-b': lesson(['broad'], { createdAt: '2026-02-01' }),
        'l-c': lesson(['broad'], { createdAt: '2026-01-01' }),
      },
      { broad: FILE_GLOB('**/*.yaml') },
    );
    const out = evaluateCase(
      g,
      {
        id: 'edit-yaml',
        query: { file: 'x.yaml' },
        shouldRetrieve: ['l-a', 'l-b', 'l-c'],
        shouldNotRetrieve: [],
      },
      2,
    );
    expect(out.retrieved).toHaveLength(2);
    expect(out.retrieved).toEqual(['l-a', 'l-b']); // ties break newer-first
    expect(out.falseNegatives).toEqual(['l-c']);
  });
});

describe('runRecurrenceSuite', () => {
  const g = graph(
    { 'l-ts': lesson(['tf']), 'l-md': lesson(['tm']) },
    { tf: FILE_GLOB('src/**/*.ts'), tm: FILE_GLOB('**/*.md') },
  );

  it('aggregates a clean suite to precision=1, recall=1, fpRate=0 with no regressions', () => {
    const suite: RecurrenceSuite = {
      topN: 10,
      graph: g,
      cases: [
        {
          id: 'edit-ts',
          query: { file: 'src/a.ts' },
          shouldRetrieve: ['l-ts'],
          shouldNotRetrieve: ['l-md'],
        },
        {
          id: 'edit-md',
          query: { file: 'x.md' },
          shouldRetrieve: ['l-md'],
          shouldNotRetrieve: ['l-ts'],
        },
      ],
    };
    const report = runRecurrenceSuite(suite);
    expect(report.topN).toBe(10);
    expect(report.metrics.precision).toBe(1);
    expect(report.metrics.recall).toBe(1);
    expect(report.metrics.falsePositiveRate).toBe(0);
    expect(report.regressions).toEqual([]);
    expect(report.outcomes).toHaveLength(2);
  });

  it('reports per-case regressions with missed and leaked lessons', () => {
    const suite: RecurrenceSuite = {
      topN: 10,
      graph: g,
      cases: [
        // Wrong expectation: l-ts cannot fire for a .md file, and l-md leaks.
        {
          id: 'bad',
          query: { file: 'x.md' },
          shouldRetrieve: ['l-ts'],
          shouldNotRetrieve: ['l-md'],
        },
      ],
    };
    const report = runRecurrenceSuite(suite);
    expect(report.regressions).toEqual([{ caseId: 'bad', missed: ['l-ts'], leaked: ['l-md'] }]);
  });

  it('honors a per-case topN override over the suite default', () => {
    const shared = graph(
      {
        'l-a': lesson(['broad'], { createdAt: '2026-03-01' }),
        'l-b': lesson(['broad'], { createdAt: '2026-02-01' }),
      },
      { broad: FILE_GLOB('**/*.yaml') },
    );
    const suite: RecurrenceSuite = {
      topN: 10, // at the suite default both match -> l-b would leak; the per-case cap excludes it
      graph: shared,
      cases: [
        {
          id: 'capped',
          query: { file: 'x.yaml' },
          topN: 1,
          shouldRetrieve: ['l-a'],
          shouldNotRetrieve: ['l-b'],
        },
      ],
    };
    const report = runRecurrenceSuite(suite);
    expect(report.outcomes[0]!.retrieved).toEqual(['l-a']);
    expect(report.metrics.precision).toBe(1);
    expect(report.metrics.falsePositiveRate).toBe(0);
  });
});
