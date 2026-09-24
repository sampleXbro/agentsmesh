import { describe, expect, it } from 'vitest';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import type { OutcomeEvent } from '../../../src/lessons/outcome-log.js';
import { summarizeEffectiveness } from '../../../src/lessons/stats-effectiveness.js';

const GRAPH: LessonsGraph = {
  version: 2,
  lessons: {
    l1: {
      rule: 'r',
      topics: ['t'],
      triggers: ['g'],
      evidence: [],
      status: 'active',
      createdAt: '2026-01-01',
    },
  },
  topics: { t: { summary: 't' } },
  triggers: { g: { kind: 'file_glob', pattern: 'src/**' } },
};
const at = (minutes: number): string =>
  new Date(Date.parse('2026-01-01T00:00:00Z') + minutes * 60_000).toISOString();
const d = (lessonId: string, k: string, minutes: number): OutcomeEvent => ({
  ts: at(minutes),
  kind: 'delivered',
  lessonId,
  contextKey: k,
  session: 's1',
});
const f = (k: string, minutes: number): OutcomeEvent => ({
  ts: at(minutes),
  kind: 'failure',
  contextKey: k,
  session: 's1',
});

const ALWAYS_MISSED = [
  d('l1', 'file:src/a.ts', 0),
  f('file:src/a.ts', 1),
  d('l1', 'file:src/b.ts', 60),
  f('file:src/b.ts', 61),
  d('l1', 'file:src/a.ts', 120),
  f('file:src/a.ts', 121),
];

describe('summarizeEffectiveness', () => {
  it('is neutral (heldRate 1, all zero) with no events', () => {
    expect(summarizeEffectiveness([], GRAPH)).toEqual({
      deliveries: 0,
      lessonsDelivered: 0,
      failuresObserved: 0,
      misses: 0,
      failingActions: 0,
      heldRate: 1,
      ineffectiveLessons: 0,
    });
  });

  it('held rate = deliveries NOT followed by a failure matching the lesson, with distinct failing actions beside it', () => {
    // Miss: src/a.ts fails a minute later. Held: the cmd:cd failure is outside the lesson's trigger.
    const events = [
      d('l1', 'file:src/a.ts', 0),
      f('file:src/a.ts', 1),
      d('l1', 'file:src/b.ts', 60),
      f('cmd:cd', 61),
    ];
    expect(summarizeEffectiveness(events, GRAPH)).toEqual({
      deliveries: 2,
      lessonsDelivered: 1,
      failuresObserved: 2,
      misses: 1,
      failingActions: 1,
      heldRate: 0.5,
      ineffectiveLessons: 0, // < 3 deliveries
    });
  });

  it('flags a lesson delivered >=3× that missed every time as ineffective', () => {
    const r = summarizeEffectiveness(ALWAYS_MISSED, GRAPH);
    expect(r.deliveries).toBe(3);
    expect(r.misses).toBe(3);
    expect(r.failingActions).toBe(2);
    expect(r.heldRate).toBe(0);
    expect(r.ineffectiveLessons).toBe(1);
  });

  it('does not count a deprecated lesson as ineffective (nothing to act on)', () => {
    const graph: LessonsGraph = {
      ...GRAPH,
      lessons: { l1: { ...GRAPH.lessons.l1!, status: 'deprecated' } },
    };
    expect(summarizeEffectiveness(ALWAYS_MISSED, graph).ineffectiveLessons).toBe(0);
  });
});
