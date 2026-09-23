import { describe, expect, it } from 'vitest';
import type { Lesson, LessonsGraph } from '../../../src/lessons/graph-schema.js';
import { mergeGraphs } from '../../../src/lessons/merge-graph.js';
import { validateLessonsGraph } from '../../../src/lessons/validate.js';

const TRIGGERS: LessonsGraph['triggers'] = {
  't-a': { kind: 'file_glob', pattern: 'src/a.ts' },
  't-b': { kind: 'file_glob', pattern: 'src/b.ts' },
  't-x': { kind: 'file_glob', pattern: 'src/x.ts' },
  't-y': { kind: 'file_glob', pattern: 'src/y.ts' },
};

function lesson(rule: string, over: Partial<Lesson> = {}): Lesson {
  return {
    rule,
    topics: ['t'],
    triggers: [],
    evidence: [],
    status: 'active',
    createdAt: '2026-06-01',
    ...over,
  };
}
function graph(lessons: Record<string, Lesson>, version: 1 | 2 = 2): LessonsGraph {
  return { version, lessons, topics: { t: { summary: 'T.' } }, triggers: { ...TRIGGERS } };
}

describe('mergeGraphs — same lesson edited on both branches', () => {
  it('keeps both sides triggers, evidence and a rationale added on one side', () => {
    const base = graph({ l: lesson('Rule.', { triggers: ['t-a'] }) });
    const ours = graph({ l: lesson('Rule.', { triggers: ['t-a', 't-x'], evidence: ['e1'] }) });
    const theirs = graph({
      l: lesson('Rule.', { triggers: ['t-a', 't-y'], evidence: ['e2'], rationale: 'Why.' }),
    });
    for (const m of [mergeGraphs(base, ours, theirs), mergeGraphs(base, theirs, ours)]) {
      expect([...m.lessons.l!.triggers].sort()).toEqual(['t-a', 't-x', 't-y']);
      expect([...m.lessons.l!.evidence].sort()).toEqual(['e1', 'e2']);
      expect(m.lessons.l!.rationale).toBe('Why.');
    }
  });

  it('is side-order independent, list order included', () => {
    const base = graph({ l: lesson('Rule.') });
    const ours = graph({ l: lesson('Rule.', { evidence: ['zzz'] }) });
    const theirs = graph({ l: lesson('Rule.', { evidence: ['aaa'] }) });
    expect(mergeGraphs(base, ours, theirs)).toEqual(mergeGraphs(base, theirs, ours));
  });

  it('honours a removal made on one side while the other side edits elsewhere', () => {
    const base = graph({ l: lesson('Rule.', { triggers: ['t-a', 't-b'] }) });
    const ours = graph({ l: lesson('Rule.', { triggers: ['t-a'] }) });
    const theirs = graph({ l: lesson('Rule.', { triggers: ['t-a', 't-b', 't-y'] }) });
    expect(mergeGraphs(base, ours, theirs).lessons.l!.triggers).toEqual(['t-a', 't-y']);
  });

  it('never leaves a lesson without a topic when each side dropped a different one', () => {
    const topics = { t: { summary: 'T.' }, u: { summary: 'U.' } };
    const base = { ...graph({ l: lesson('Rule.', { topics: ['t', 'u'] }) }), topics };
    const ours = { ...graph({ l: lesson('Rule.', { topics: ['t'] }) }), topics };
    const theirs = { ...graph({ l: lesson('Rule.', { topics: ['u'] }) }), topics };
    const m = mergeGraphs(base, ours, theirs);
    expect([...m.lessons.l!.topics].sort()).toEqual(['t', 'u']);
    expect(validateLessonsGraph(m).ok).toBe(true);
  });

  it('keeps the earliest createdAt when both branches captured the same lesson', () => {
    const ours = graph({ l: lesson('Rule.', { createdAt: '2026-07-02' }) });
    const theirs = graph({ l: lesson('Rule.', { createdAt: '2026-07-01' }) });
    expect(mergeGraphs(graph({}), ours, theirs).lessons.l!.createdAt).toBe('2026-07-01');
    expect(mergeGraphs(graph({}), theirs, ours).lessons.l!.createdAt).toBe('2026-07-01');
  });
});

describe('mergeGraphs — lifecycle', () => {
  it('lets a superseded lesson beat an active edit even when content sorts the other way', () => {
    const base = graph({ l: lesson('Rule.'), k: lesson('Keeper.') });
    // Evidence 'a' < 'b': a whole-record string tiebreak would pick the active side.
    const ours = graph({
      l: lesson('Rule.', { status: 'superseded', supersededBy: 'k', evidence: ['a'] }),
      k: lesson('Keeper.'),
    });
    const theirs = graph({ l: lesson('Rule.', { evidence: ['b'] }), k: lesson('Keeper.') });
    for (const m of [mergeGraphs(base, ours, theirs), mergeGraphs(base, theirs, ours)]) {
      expect(m.lessons.l!.status).toBe('superseded');
      expect(m.lessons.l!.supersededBy).toBe('k');
      expect([...m.lessons.l!.evidence].sort()).toEqual(['a', 'b']);
    }
  });

  it('keeps the edit made on the other side when one side deprecates the lesson', () => {
    const base = graph({ l: lesson('Rule.') });
    const ours = graph({ l: lesson('Rule.', { status: 'deprecated' }) });
    const theirs = graph({ l: lesson('Rule.', { triggers: ['t-y'] }) });
    const m = mergeGraphs(base, ours, theirs);
    expect(m.lessons.l!.status).toBe('deprecated');
    expect(m.lessons.l!.supersededBy).toBeUndefined();
    expect(m.lessons.l!.triggers).toEqual(['t-y']);
  });

  it('prefers superseded over deprecated when the two sides retired it differently', () => {
    const base = graph({ l: lesson('Rule.'), k: lesson('Keeper.') });
    const ours = graph({ l: lesson('Rule.', { status: 'deprecated' }), k: lesson('Keeper.') });
    const theirs = graph({
      l: lesson('Rule.', { status: 'superseded', supersededBy: 'k' }),
      k: lesson('Keeper.'),
    });
    for (const m of [mergeGraphs(base, ours, theirs), mergeGraphs(base, theirs, ours)]) {
      expect(m.lessons.l!.status).toBe('superseded');
      expect(m.lessons.l!.supersededBy).toBe('k');
    }
  });
});

describe('mergeGraphs — `lessons merge` on one branch, an edit on the other', () => {
  const base = graph({
    a: lesson('Loser.', { triggers: ['t-a'] }),
    b: lesson('Keeper.', { triggers: ['t-b'] }),
  });
  const merged = graph({
    a: lesson('Loser.', { triggers: ['t-a'], status: 'superseded', supersededBy: 'b' }),
    b: lesson('Keeper.', { triggers: ['t-b', 't-a'] }),
  });

  it('keeps the loser triggers on the keeper when the other side edited the keeper', () => {
    const editedKeeper = graph({
      a: lesson('Loser.', { triggers: ['t-a'] }),
      b: lesson('Keeper.', { triggers: ['t-b', 't-x'], evidence: ['e'] }),
    });
    for (const m of [
      mergeGraphs(base, merged, editedKeeper),
      mergeGraphs(base, editedKeeper, merged),
    ]) {
      expect(m.lessons.a!.status).toBe('superseded');
      expect([...m.lessons.b!.triggers].sort()).toEqual(['t-a', 't-b', 't-x']);
      expect(validateLessonsGraph(m).ok).toBe(true);
    }
  });

  it('carries a trigger added to the loser on the other side over to the keeper', () => {
    const editedLoser = graph({
      a: lesson('Loser.', { triggers: ['t-a', 't-y'] }),
      b: lesson('Keeper.', { triggers: ['t-b'] }),
    });
    for (const m of [
      mergeGraphs(base, merged, editedLoser),
      mergeGraphs(base, editedLoser, merged),
    ]) {
      expect(m.lessons.a!.status).toBe('superseded');
      expect([...m.lessons.b!.triggers].sort()).toEqual(['t-a', 't-b', 't-y']);
    }
  });
});

describe('mergeGraphs — schema version', () => {
  it('stamps the higher version of the two sides', () => {
    expect(mergeGraphs(graph({}, 1), graph({}, 1), graph({}, 2)).version).toBe(2);
    expect(mergeGraphs(graph({}, 1), graph({}, 2), graph({}, 1)).version).toBe(2);
    expect(mergeGraphs(graph({}, 1), graph({}, 1), graph({}, 1)).version).toBe(1);
  });
});
