/**
 * A delivery is a MISS only when, in the same session and within a bounded
 * window after it, an action failed that re-matches one of THAT lesson's own
 * triggers. The old rule (any later failure sharing the session + action key,
 * no time limit, sessionless events in one global scope) put 63% of this repo's
 * misses on `cmd:cd`, with a median delivery-to-failure gap of 6.5 hours.
 */

import { describe, expect, it } from 'vitest';
import {
  effectiveness,
  effectivenessScore,
  effectivenessScores,
  INEFFECTIVE_MIN_DELIVERIES,
  MISS_WINDOW_MS,
} from '../../../src/lessons/effectiveness.js';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import type { OutcomeEvent } from '../../../src/lessons/outcome-log.js';

const lesson = (triggers: string[]): LessonsGraph['lessons'][string] => ({
  rule: 'A rule.',
  topics: ['t'],
  triggers,
  evidence: [],
  status: 'active',
  createdAt: '2026-01-01',
});

const GRAPH: LessonsGraph = {
  version: 2,
  topics: { t: { summary: 'T.' } },
  triggers: {
    glob: { kind: 'file_glob', pattern: 'src/lessons/**' },
    cmd: { kind: 'command_pattern', pattern: '\\bpnpm test\\b' },
    kw: { kind: 'keyword', pattern: 'vitest' },
  },
  lessons: { 'glob-l': lesson(['glob']), 'cmd-l': lesson(['cmd']), 'kw-l': lesson(['kw']) },
};

const T0 = Date.parse('2026-01-01T10:00:00.000Z');
const at = (minutes: number): string => new Date(T0 + minutes * 60_000).toISOString();

const d = (
  lessonId: string,
  contextKey: string,
  minutes = 0,
  session: string | null = 's1',
): OutcomeEvent => ({
  ts: at(minutes),
  kind: 'delivered',
  lessonId,
  contextKey,
  ...(session !== null ? { session } : {}),
});
const f = (contextKey: string, minutes: number, session: string | null = 's1'): OutcomeEvent => ({
  ts: at(minutes),
  kind: 'failure',
  contextKey,
  ...(session !== null ? { session } : {}),
});

describe('effectiveness — what counts as a miss', () => {
  it('a later failure that re-matches the lesson trigger in the same session is a miss', () => {
    const e = effectiveness(
      [d('glob-l', 'file:src/lessons/a.ts'), f('file:src/lessons/b.ts', 5)],
      GRAPH,
    );
    expect(e.get('glob-l')).toEqual({
      delivered: 1,
      missed: 1,
      failingActions: ['file:src/lessons/b.ts'],
    });
  });

  it('a failure on an action the lesson does not cover is not a miss (the cmd:cd case)', () => {
    const e = effectiveness([d('glob-l', 'cmd:cd'), f('cmd:cd', 1)], GRAPH);
    expect(e.get('glob-l')).toEqual({ delivered: 1, missed: 0, failingActions: [] });
  });

  it('a failure after the window is not a miss', () => {
    const late = MISS_WINDOW_MS / 60_000 + 1;
    const e = effectiveness(
      [d('glob-l', 'file:src/lessons/a.ts'), f('file:src/lessons/a.ts', late)],
      GRAPH,
    );
    expect(e.get('glob-l')!.missed).toBe(0);
  });

  it('a failure in a different session is not a miss', () => {
    const e = effectiveness(
      [d('glob-l', 'file:src/lessons/a.ts'), f('file:src/lessons/a.ts', 1, 's2')],
      GRAPH,
    );
    expect(e.get('glob-l')!.missed).toBe(0);
  });

  it('never attributes across sessionless events', () => {
    const both = effectiveness(
      [d('glob-l', 'file:src/lessons/a.ts', 0, null), f('file:src/lessons/a.ts', 1, null)],
      GRAPH,
    );
    expect(both.get('glob-l')!.missed).toBe(0);
    const failureOnly = effectiveness(
      [d('glob-l', 'file:src/lessons/a.ts'), f('file:src/lessons/a.ts', 1, null)],
      GRAPH,
    );
    expect(failureOnly.get('glob-l')!.missed).toBe(0);
  });

  it('a failure before the delivery never impeaches it — by time or by stream order', () => {
    expect(
      effectiveness(
        [f('file:src/lessons/a.ts', 0), d('glob-l', 'file:src/lessons/a.ts', 1)],
        GRAPH,
      ).get('glob-l')!.missed,
    ).toBe(0);
    expect(
      effectiveness(
        [f('file:src/lessons/a.ts', 0), d('glob-l', 'file:src/lessons/a.ts', 0)],
        GRAPH,
      ).get('glob-l')!.missed,
    ).toBe(0);
  });

  it('re-matches command lessons against the command class', () => {
    expect(
      effectiveness([d('cmd-l', 'cmd:pnpm test'), f('cmd:pnpm test', 2)], GRAPH).get('cmd-l')!
        .missed,
    ).toBe(1);
    expect(
      effectiveness([d('cmd-l', 'cmd:pnpm test'), f('cmd:pnpm lint', 2)], GRAPH).get('cmd-l')!
        .missed,
    ).toBe(0);
  });

  it('re-matches keyword triggers against the failing path tokens, as recall does', () => {
    const e = effectiveness([d('kw-l', 'file:src/a.ts'), f('file:src/vitest.config.ts', 3)], GRAPH);
    expect(e.get('kw-l')!.missed).toBe(1);
  });

  it('reports distinct failing actions beside the miss count', () => {
    const e = effectiveness(
      [
        d('glob-l', 'file:src/lessons/a.ts', 0),
        d('glob-l', 'file:src/lessons/a.ts', 10),
        f('file:src/lessons/b.ts', 15),
      ],
      GRAPH,
    );
    expect(e.get('glob-l')).toEqual({
      delivered: 2,
      missed: 2,
      failingActions: ['file:src/lessons/b.ts'],
    });
  });

  it('never misses a lesson the graph does not know', () => {
    expect(
      effectiveness(
        [d('ghost', 'file:src/lessons/a.ts'), f('file:src/lessons/a.ts', 1)],
        GRAPH,
      ).get('ghost')!.missed,
    ).toBe(0);
  });

  it('never attributes an event with an unreadable timestamp', () => {
    const bad: OutcomeEvent = { ...d('glob-l', 'file:src/lessons/a.ts'), ts: 'not-a-date' };
    expect(effectiveness([bad, f('file:src/lessons/a.ts', 1)], GRAPH).get('glob-l')!.missed).toBe(
      0,
    );
  });
});

describe('effectiveness scores for recall ranking', () => {
  it('scores: undelivered → neutral 1; all-missed → 0; half → 0.5', () => {
    expect(effectivenessScore({ delivered: 0, missed: 0 })).toBe(1);
    expect(effectivenessScore({ delivered: 3, missed: 3 })).toBe(0);
    expect(effectivenessScore({ delivered: 2, missed: 1 })).toBe(0.5);
  });

  it('only scores lessons delivered often enough to judge — thinner samples stay neutral', () => {
    const thin: OutcomeEvent[] = [];
    for (let i = 0; i < INEFFECTIVE_MIN_DELIVERIES - 1; i += 1) {
      thin.push(
        d('glob-l', 'file:src/lessons/a.ts', i * 60),
        f('file:src/lessons/a.ts', i * 60 + 1),
      );
    }
    expect(effectivenessScores(thin, GRAPH).has('glob-l')).toBe(false);
    const enough = [
      ...thin,
      d('glob-l', 'file:src/lessons/a.ts', 600),
      f('file:src/lessons/a.ts', 601),
    ];
    expect(effectivenessScores(enough, GRAPH).get('glob-l')).toBe(0);
  });
});
