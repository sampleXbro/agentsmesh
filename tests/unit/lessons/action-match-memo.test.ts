/**
 * The hook computes effectiveness on every recall, over an outcome log of up
 * to 5000 events. Each delivery is checked against the later failures of its
 * session, so the same (lesson, action) pair comes up again and again. Match
 * each pair once, or a full log adds ~100 ms to every edit.
 */

import { describe, expect, it } from 'vitest';
import { effectiveness } from '../../../src/lessons/effectiveness.js';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import type { OutcomeEvent } from '../../../src/lessons/outcome-log.js';

/** A graph whose lesson reads are counted: one read per real match attempt. */
function countingGraph(): { graph: LessonsGraph; reads: () => number } {
  let reads = 0;
  const lessons: LessonsGraph['lessons'] = {
    l: {
      rule: 'r',
      topics: ['t'],
      triggers: ['g'],
      evidence: [],
      status: 'active',
      createdAt: '2026-01-01',
    },
  };
  const graph: LessonsGraph = {
    version: 2,
    topics: { t: { summary: 'T' } },
    triggers: { g: { kind: 'file_glob', pattern: 'docs/**' } },
    lessons: new Proxy(lessons, {
      get(target, key, receiver) {
        if (key === 'l') reads += 1;
        return Reflect.get(target, key, receiver) as unknown;
      },
    }),
  };
  return { graph, reads: () => reads };
}

function log(deliveries: number, failures: number): OutcomeEvent[] {
  const ts = '2026-01-01T00:00:00Z';
  const events: OutcomeEvent[] = [];
  for (let i = 0; i < deliveries; i += 1)
    events.push({
      ts,
      kind: 'delivered',
      lessonId: 'l',
      contextKey: 'file:src/a.ts',
      session: 's',
    });
  for (let i = 0; i < failures; i += 1)
    events.push({ ts, kind: 'failure', contextKey: 'file:src/a.ts', session: 's' });
  return events;
}

describe('effectiveness matches each (lesson, action) pair once', () => {
  it('does not re-match a pair for every delivery and failure', () => {
    const { graph, reads } = countingGraph();
    const result = effectiveness(log(200, 50), graph);
    expect(result.get('l')).toEqual({ delivered: 200, missed: 0, failingActions: [] });
    expect(reads()).toBe(1);
  });
});
