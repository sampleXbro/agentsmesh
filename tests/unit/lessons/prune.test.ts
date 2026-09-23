import { describe, expect, it } from 'vitest';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import { applyPruneToGraph, isEmptyPrunePlan, planPrune } from '../../../src/lessons/prune.js';
import { validateLessonsGraph } from '../../../src/lessons/validate.js';

function fileGlob(pattern: string): { kind: 'file_glob'; pattern: string } {
  return { kind: 'file_glob', pattern };
}

/** Over-cap active lesson sharing one broad trigger with two others. */
function trimGraph(): LessonsGraph {
  return {
    version: 1,
    lessons: {
      big: {
        rule: 'Big rule.',
        topics: ['t'],
        triggers: ['t-shared', 't-a', 't-b'],
        evidence: [],
        status: 'active',
        createdAt: '2026-06-01',
      },
      o1: {
        rule: 'Other one.',
        topics: ['t'],
        triggers: ['t-shared'],
        evidence: [],
        status: 'active',
        createdAt: '2026-06-01',
      },
      o2: {
        rule: 'Other two.',
        topics: ['t'],
        triggers: ['t-shared'],
        evidence: [],
        status: 'active',
        createdAt: '2026-06-01',
      },
    },
    topics: { t: { summary: 'T.' } },
    triggers: {
      't-shared': fileGlob('src/**'),
      't-a': fileGlob('src/a.ts'),
      't-b': fileGlob('src/b.ts'),
    },
  };
}

/** Trigger referenced only by a superseded lesson — dead for recall. */
function deadGraph(): LessonsGraph {
  return {
    version: 1,
    lessons: {
      active1: {
        rule: 'Live rule.',
        topics: ['t'],
        triggers: ['t-live'],
        evidence: [],
        status: 'active',
        createdAt: '2026-06-02',
      },
      sup1: {
        rule: 'Dead rule.',
        topics: ['t'],
        triggers: ['t-dead'],
        evidence: [],
        status: 'superseded',
        supersededBy: 'active1',
        createdAt: '2026-06-01',
      },
    },
    topics: { t: { summary: 'T.' } },
    triggers: { 't-live': fileGlob('src/live.ts'), 't-dead': fileGlob('src/dead.ts') },
  };
}

describe('planPrune', () => {
  it('trims an over-cap active lesson, dropping the highest-fanout (least specific) triggers first', () => {
    const plan = planPrune(trimGraph(), { cap: 2 });
    expect(plan.trimmedLessons).toEqual([
      { id: 'big', removedTriggers: ['t-shared'], keptCount: 2 },
    ]);
  });

  it('does not list a trimmed trigger as dead when another active lesson still references it', () => {
    const plan = planPrune(trimGraph(), { cap: 2 });
    expect(plan.removedTriggerIds).toEqual([]);
  });

  it('marks a trigger referenced only by a non-active lesson as dead', () => {
    const plan = planPrune(deadGraph());
    expect(plan.removedTriggerIds).toEqual(['t-dead']);
    expect(plan.trimmedLessons).toEqual([]);
  });

  it('skips over-cap trimming when trimOverCap is false, but still GCs dead triggers (auto-prune subset)', () => {
    // The over-cap lesson is NOT trimmed...
    const plan = planPrune(trimGraph(), { cap: 2, trimOverCap: false });
    expect(plan.trimmedLessons).toEqual([]);
    // ...while the GC-only operations (orphan/dead-trigger removal) still run.
    const dead = planPrune(deadGraph(), { trimOverCap: false });
    expect(dead.removedTriggerIds).toEqual(['t-dead']);
  });

  it('breaks fanout ties deterministically by ascending trigger id', () => {
    // Three triggers with identical fanout (each referenced only by `solo`) in
    // descending id order — forces the id tie-break in both comparison
    // directions and keeps the lexicographically-smallest id at cap 1.
    const graph: LessonsGraph = {
      version: 1,
      lessons: {
        solo: {
          rule: 'Solo rule.',
          topics: ['t'],
          triggers: ['t-c', 't-b', 't-a'],
          evidence: [],
          status: 'active',
          createdAt: '2026-06-01',
        },
      },
      topics: { t: { summary: 'T.' } },
      triggers: {
        't-a': fileGlob('src/a.ts'),
        't-b': fileGlob('src/b.ts'),
        't-c': fileGlob('src/c.ts'),
      },
    };
    const plan = planPrune(graph, { cap: 1 });
    expect(plan.trimmedLessons).toEqual([
      { id: 'solo', removedTriggers: ['t-b', 't-c'], keptCount: 1 },
    ]);
  });

  it('is a pure read — it does not mutate the graph', () => {
    const g = trimGraph();
    planPrune(g, { cap: 2 });
    expect(g.lessons.big?.triggers).toEqual(['t-shared', 't-a', 't-b']);
    expect(Object.keys(g.triggers).sort()).toEqual(['t-a', 't-b', 't-shared']);
  });
});

describe('applyPruneToGraph', () => {
  it('trims the lesson to the most specific triggers and keeps a still-shared trigger in the table', () => {
    const g = trimGraph();
    applyPruneToGraph(g, planPrune(g, { cap: 2 }));
    expect(g.lessons.big?.triggers).toEqual(['t-a', 't-b']);
    expect(g.triggers['t-shared']).toBeDefined(); // o1/o2 still reference it
    expect(validateLessonsGraph(g).ok).toBe(true);
  });

  it('removes a dead trigger from the table and strips its dangling reference', () => {
    const g = deadGraph();
    applyPruneToGraph(g, planPrune(g));
    expect(g.triggers['t-dead']).toBeUndefined();
    expect(g.lessons.sup1?.triggers).toEqual([]);
    expect(validateLessonsGraph(g).ok).toBe(true);
  });

  it('is idempotent: a second plan over the pruned graph is empty', () => {
    const g = trimGraph();
    applyPruneToGraph(g, planPrune(g, { cap: 2 }));
    const second = planPrune(g, { cap: 2 });
    expect(second.removedTriggerIds).toEqual([]);
    expect(second.trimmedLessons).toEqual([]);
  });

  it('tolerates a stale plan whose trimmed lesson no longer exists', () => {
    // A plan computed against an older graph: `ghost` was removed since. Applying
    // it must skip the missing lesson rather than throw or resurrect it.
    const g = deadGraph();
    applyPruneToGraph(g, {
      cap: 8,
      removedTriggerIds: [],
      removedTopicIds: [],
      trimmedLessons: [{ id: 'ghost', removedTriggers: ['t-live'], keptCount: 0 }],
    });
    expect(g.lessons.ghost).toBeUndefined();
    expect(g.lessons.active1?.triggers).toEqual(['t-live']); // untouched
    expect(validateLessonsGraph(g).ok).toBe(true);
  });

  it('never trims an active lesson below one trigger (cap clamped to ≥ 1)', () => {
    const g = trimGraph();
    applyPruneToGraph(g, planPrune(g, { cap: 0 }));
    expect(g.lessons.big?.triggers.length).toBeGreaterThanOrEqual(1);
    expect(validateLessonsGraph(g).ok).toBe(true);
  });
});

describe('prune — orphan topic GC', () => {
  function graphWithOrphanTopic(): LessonsGraph {
    return {
      version: 1,
      lessons: {
        a: {
          rule: 'A rule.',
          topics: ['used'],
          triggers: ['t-a'],
          evidence: [],
          status: 'active',
          createdAt: '2026-06-01',
        },
      },
      topics: { used: { summary: 'Used.' }, orphan: { summary: 'Referenced by nobody.' } },
      triggers: { 't-a': { kind: 'file_glob', pattern: 'src/**' } },
    };
  }

  it('planPrune reports a topic referenced by zero lessons', () => {
    expect(planPrune(graphWithOrphanTopic()).removedTopicIds).toEqual(['orphan']);
  });

  it('applyPruneToGraph deletes the orphan topic; graph stays valid', () => {
    const g = graphWithOrphanTopic();
    applyPruneToGraph(g, planPrune(g));
    expect(g.topics.orphan).toBeUndefined();
    expect(g.topics.used).toBeDefined();
    expect(validateLessonsGraph(g).ok).toBe(true);
  });

  it('keeps a topic still referenced by a deprecated lesson', () => {
    const g = graphWithOrphanTopic();
    g.lessons.b = {
      rule: 'B rule.',
      topics: ['kept-by-dep'],
      triggers: [],
      evidence: [],
      status: 'deprecated',
      createdAt: '2026-06-01',
    };
    g.topics['kept-by-dep'] = { summary: 'Held by a deprecated lesson.' };
    expect(planPrune(g).removedTopicIds).toEqual(['orphan']);
  });

  it('isEmptyPrunePlan is false when only a topic would be removed', () => {
    const plan = planPrune(graphWithOrphanTopic());
    expect(plan.removedTriggerIds).toEqual([]);
    expect(plan.trimmedLessons).toEqual([]);
    expect(isEmptyPrunePlan(plan)).toBe(false);
  });
});
