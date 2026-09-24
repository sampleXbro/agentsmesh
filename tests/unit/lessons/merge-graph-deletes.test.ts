/**
 * A trigger or topic that one branch deleted (untrigger, prune) stays deleted
 * when the other branch did not touch it — a plain line merge keeps the
 * deletion too. The merge used to bring such nodes back as orphans.
 */

import { describe, expect, it } from 'vitest';
import type { Lesson, LessonsGraph } from '../../../src/lessons/graph-schema.js';
import { mergeGraphs } from '../../../src/lessons/merge-graph.js';
import { validateLessonsGraph } from '../../../src/lessons/validate.js';

const lesson = (rule: string, triggers: string[], topics = ['t']): Lesson => ({
  rule,
  topics,
  triggers,
  evidence: [],
  status: 'active',
  createdAt: '2026-06-01',
});
const glob = (pattern: string): LessonsGraph['triggers'][string] => ({
  kind: 'file_glob',
  pattern,
});

const base: LessonsGraph = {
  version: 2,
  lessons: { l: lesson('L.', ['t1', 't2'], ['t', 'old']) },
  topics: { t: { summary: 'T.' }, old: { summary: 'Old.' } },
  triggers: { t1: glob('src/a.ts'), t2: glob('src/b.ts') },
};
/** This branch ran `untrigger l t2` and pruned the orphan topic. */
const ours: LessonsGraph = {
  ...base,
  lessons: { l: lesson('L.', ['t1']) },
  topics: { t: { summary: 'T.' } },
  triggers: { t1: glob('src/a.ts') },
};

describe('mergeGraphs — deletions on one branch', () => {
  it('keeps a trigger and a topic deleted on one side when the other side added something unrelated', () => {
    const theirs: LessonsGraph = {
      ...base,
      lessons: { ...base.lessons, m: lesson('M.', ['t3']) },
      triggers: { ...base.triggers, t3: glob('src/c.ts') },
    };
    const merged = mergeGraphs(base, ours, theirs);
    expect(Object.keys(merged.triggers).sort()).toEqual(['t1', 't3']);
    expect(Object.keys(merged.topics)).toEqual(['t']);
    expect(validateLessonsGraph(merged).findings).toEqual([]);
  });

  it('keeps a deleted trigger that the other side now uses', () => {
    const theirs: LessonsGraph = {
      ...base,
      lessons: { ...base.lessons, m: lesson('M.', ['t2']) },
    };
    expect(Object.keys(mergeGraphs(base, ours, theirs).triggers).sort()).toEqual(['t1', 't2']);
  });

  it('keeps a deleted trigger that the other side changed', () => {
    const theirs: LessonsGraph = { ...base, triggers: { ...base.triggers, t2: glob('src/b2.ts') } };
    expect(mergeGraphs(base, ours, theirs).triggers.t2).toEqual(glob('src/b2.ts'));
  });

  it('is the same whichever side deleted', () => {
    const theirs: LessonsGraph = {
      ...base,
      lessons: { ...base.lessons, m: lesson('M.', ['t3']) },
      triggers: { ...base.triggers, t3: glob('src/c.ts') },
    };
    expect(mergeGraphs(base, theirs, ours)).toEqual(mergeGraphs(base, ours, theirs));
  });
});
