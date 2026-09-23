import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { graphFilePath } from '../../src/lessons/graph-store.js';
import type { LessonsGraph } from '../../src/lessons/graph-schema.js';
import {
  appendOutcomeEvent,
  loadEffectiveness,
  type OutcomeEvent,
} from '../../src/lessons/outcome-log.js';
import { recallLessons } from '../../src/lessons/recall.js';

const ON = { AGENTSMESH_LESSONS_TELEMETRY: '1' } as NodeJS.ProcessEnv;

// Two lessons tied on every frozen ranking signal — only effectiveness can reorder them.
const GRAPH: LessonsGraph = {
  version: 2,
  topics: { t: { summary: 't' } },
  triggers: { 'kw-foo': { kind: 'keyword', pattern: 'foo' } },
  lessons: {
    'l-a': {
      rule: 'do foo carefully',
      topics: ['t'],
      triggers: ['kw-foo'],
      evidence: [],
      status: 'active',
      createdAt: '2026-01-01',
    },
    'l-b': {
      rule: 'do foo carefully',
      topics: ['t'],
      triggers: ['kw-foo'],
      evidence: [],
      status: 'active',
      createdAt: '2026-01-01',
    },
  },
};

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-outcome-e2e-'));
  const p = graphFilePath(root);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(GRAPH), 'utf8');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const ev = (e: OutcomeEvent): OutcomeEvent => e;

describe('EVALUATE end-to-end: outcome log → effectiveness → recall down-rank', () => {
  it('a lesson that fired but the mistake recurred sinks below its tied effective sibling', async () => {
    // Three times: l-a delivered, then within a minute an action its own `foo`
    // keyword trigger matches failed in the same session → every delivery missed.
    for (const minute of [0, 10, 20]) {
      const ts = (m: number): string => new Date(Date.UTC(2026, 0, 1, 0, m)).toISOString();
      appendOutcomeEvent(
        root,
        ev({
          ts: ts(minute),
          kind: 'delivered',
          lessonId: 'l-a',
          contextKey: 'file:src/foo.ts',
          session: 's1',
        }),
        ON,
      );
      appendOutcomeEvent(
        root,
        ev({ ts: ts(minute + 1), kind: 'failure', contextKey: 'file:src/foo.ts', session: 's1' }),
        ON,
      );
    }

    expect(loadEffectiveness(root, GRAPH).get('l-a')).toBe(0);
    const { lessons } = await recallLessons(root, { keyword: 'foo' }, { noDedup: true });
    expect(lessons.map((l) => l.id)).toEqual(['l-b', 'l-a']);
  });

  it('with no recurrence recorded, the tied lessons keep their default order', async () => {
    appendOutcomeEvent(
      root,
      ev({
        ts: '2026-01-01T00:00:00Z',
        kind: 'delivered',
        lessonId: 'l-a',
        contextKey: 'file:src/x.ts',
        session: 's1',
      }),
      ON,
    );

    const { lessons } = await recallLessons(root, { keyword: 'foo' }, { noDedup: true });
    expect(lessons.map((l) => l.id)).toEqual(['l-a', 'l-b']);
  });
});
