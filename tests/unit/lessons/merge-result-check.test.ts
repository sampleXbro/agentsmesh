import { describe, expect, it } from 'vitest';
import type { Lesson, LessonsGraph } from '../../../src/lessons/graph-schema.js';
import { missesMergeResult, unionGraphTexts } from '../../../src/lessons/merge-sides.js';

const lesson = (rule: string, over: Partial<Lesson> = {}): Lesson => ({
  rule,
  topics: ['t'],
  triggers: [],
  evidence: [],
  status: 'active',
  createdAt: '2026-06-01',
  ...over,
});
const graph = (lessons: Record<string, Lesson>): LessonsGraph => ({
  version: 2,
  lessons,
  topics: { t: { summary: 'T.' } },
  triggers: {},
});
const text = (lessons: Record<string, Lesson>): string => JSON.stringify(graph(lessons));

function union(
  base: string,
  ours: string,
  theirs: string,
): Extract<ReturnType<typeof unionGraphTexts>, { ok: true }> {
  const r = unionGraphTexts(base, ours, theirs);
  if (!r.ok) throw new Error('expected a union');
  return r;
}

const BASE = { l0: lesson('Base.') };
const OURS = { l0: lesson('Base.', { evidence: ['ev1'] }) };
const THEIRS = { l0: lesson('Reworded.') };

describe('missesMergeResult', () => {
  const merge = union(text(BASE), text(OURS), text(THEIRS));
  const merged = merge.merged;

  it('is false for the merge result itself', () => {
    expect(missesMergeResult(merge, merged)).toBe(false);
  });

  it('is true for a file that is still this branch while the merge changed it', () => {
    expect(missesMergeResult(merge, graph(OURS))).toBe(true);
  });

  it('is false for a repaired merge result: it differs from this branch', () => {
    const repaired = graph({ l0: { ...merged.lessons.l0!, evidence: [] } });
    expect(missesMergeResult(merge, repaired)).toBe(false);
  });

  it('is true when a repair brings the file back to exactly this branch', () => {
    expect(missesMergeResult(merge, graph({ l0: { ...merged.lessons.l0!, rule: 'Base.' } }))).toBe(
      true,
    );
  });

  it('is false for a file that is the incoming branch: only this branch is the driver signature', () => {
    expect(missesMergeResult(merge, graph(THEIRS))).toBe(false);
  });

  it('is true for a file that lacks a merged lesson, whatever else it holds', () => {
    const added = union(
      text(BASE),
      text({ ...OURS, a: lesson('A.') }),
      text({ ...BASE, b: lesson('B.') }),
    );
    expect(missesMergeResult(added, graph({ ...OURS, a: lesson('A, edited.') }))).toBe(true);
  });

  it('is false when this branch, the incoming branch and the union are all the same', () => {
    const same = union(text(BASE), text(OURS), text(OURS));
    expect(missesMergeResult(same, graph(OURS))).toBe(false);
  });

  it('is false when the incoming branch changed nothing', () => {
    const nothing = union(text(BASE), text(OURS), text(BASE));
    expect(missesMergeResult(nothing, graph(OURS))).toBe(false);
  });
});
