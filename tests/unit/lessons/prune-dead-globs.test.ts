import { describe, expect, it } from 'vitest';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import { projectFilesOf } from '../../../src/lessons/project-files.js';
import { applyPruneToGraph, isEmptyPrunePlan, planPrune } from '../../../src/lessons/prune.js';
import { validateLessonsGraph } from '../../../src/lessons/validate.js';

function fileGlob(pattern: string): { kind: 'file_glob'; pattern: string } {
  return { kind: 'file_glob', pattern };
}

function deadGraph(): LessonsGraph {
  return {
    version: 1,
    lessons: {
      keep: {
        rule: 'Keeps a live trigger.',
        topics: ['t'],
        triggers: ['t-dead', 't-live'],
        evidence: [],
        status: 'active',
        createdAt: '2026-06-01',
      },
      orphaned: {
        rule: 'Every trigger dead.',
        topics: ['t'],
        triggers: ['t-dead2'],
        evidence: [],
        status: 'active',
        createdAt: '2026-06-01',
      },
    },
    topics: { t: { summary: 'T.' } },
    triggers: {
      't-dead': fileGlob('src/gone/**'),
      't-live': fileGlob('src/**'),
      't-dead2': fileGlob('also/gone/**'),
    },
  };
}

/** On disk: one file. Git history: both `gone` directories were renamed away. */
const known = projectFilesOf(['src/here/a.ts'], () => ({
  tracked: new Set(['src/here/a.ts']),
  deleted: new Set<string>(),
  renamedAway: new Set(['src/gone/x.ts', 'also/gone/y.ts']),
}));

describe('planPrune — dead file_glob GC', () => {
  it('detaches a dead glob from a lesson that keeps another trigger', () => {
    const plan = planPrune(deadGraph(), { knownPaths: known });
    expect(plan.removedDeadGlobs).toEqual([
      { id: 'keep', removedTriggers: ['t-dead'], keptCount: 1 },
    ]);
  });

  it('reports a fully dead-globbed lesson as unreachable and does NOT modify it', () => {
    const plan = planPrune(deadGraph(), { knownPaths: known });
    expect(plan.unreachableLessons).toEqual(['orphaned']);
    expect(plan.removedDeadGlobs.map((t) => t.id)).toEqual(['keep']);
  });

  it('apply detaches + GCs the dead glob, leaves the unreachable lesson valid', () => {
    const graph = deadGraph();
    const plan = planPrune(graph, { knownPaths: known });
    applyPruneToGraph(graph, plan);
    expect(graph.lessons.keep!.triggers).toEqual(['t-live']);
    expect(graph.triggers['t-dead']).toBeUndefined(); // orphaned by the detach → GC'd
    // The unreachable lesson is left intact, so it never becomes triggerless.
    expect(graph.lessons.orphaned!.triggers).toEqual(['t-dead2']);
    expect(graph.triggers['t-dead2']).toBeDefined();
    expect(validateLessonsGraph(graph).ok).toBe(true);
  });

  it('does no dead-glob GC when knownPaths is omitted (write-barrier safety)', () => {
    const plan = planPrune(deadGraph());
    expect(plan.removedDeadGlobs).toEqual([]);
    expect(plan.unreachableLessons).toEqual([]);
  });

  it('never detaches a pending glob: git history never removed its path', () => {
    const pending = projectFilesOf(['src/here/a.ts'], () => ({
      tracked: new Set(['src/here/a.ts']),
      deleted: new Set(['lib/old.ts']),
      renamedAway: new Set<string>(),
    }));
    const plan = planPrune(deadGraph(), { knownPaths: pending, trimOverCap: false });
    expect(plan.removedDeadGlobs).toEqual([]);
    expect(plan.unreachableLessons).toEqual([]);
    expect(isEmptyPrunePlan(plan)).toBe(true);
  });

  it('never detaches with a plain file set (no git evidence)', () => {
    const plan = planPrune(deadGraph(), { knownPaths: new Set(['src/here/a.ts']) });
    expect(plan.removedDeadGlobs).toEqual([]);
    expect(plan.unreachableLessons).toEqual([]);
  });
});
