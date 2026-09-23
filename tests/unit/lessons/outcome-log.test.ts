import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import { saveLessonsGraph } from '../../../src/lessons/graph-store.js';
import {
  appendOutcomeEvent,
  readOutcomeLog,
  outcomeLogPath,
  loadEffectiveness,
  recordDelivered,
  recordFailure,
  failuresForContext,
  type OutcomeEvent,
} from '../../../src/lessons/outcome-log.js';

const ON = { AGENTSMESH_LESSONS_TELEMETRY: '1' } as NodeJS.ProcessEnv;
const OFF = { AGENTSMESH_LESSONS_OUTCOME_LOG: '0' } as NodeJS.ProcessEnv;

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-outcome-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const delivered = (
  lessonId: string,
  contextKey: string,
  session?: string,
  ts = '2026-01-01T00:00:00Z',
): OutcomeEvent => ({
  ts,
  kind: 'delivered',
  lessonId,
  contextKey,
  ...(session !== undefined ? { session } : {}),
});
const failure = (
  contextKey: string,
  session?: string,
  ts = '2026-01-01T00:00:00Z',
): OutcomeEvent => ({
  ts,
  kind: 'failure',
  contextKey,
  ...(session !== undefined ? { session } : {}),
});

describe('outcome-log persistence', () => {
  it('is a no-op when the outcome log is switched off — no file, empty read', () => {
    appendOutcomeEvent(root, delivered('l1', 'k1'), OFF);
    expect(existsSync(outcomeLogPath(root))).toBe(false);
    expect(readOutcomeLog(root)).toEqual([]);
  });

  it('appends and reads back records', () => {
    appendOutcomeEvent(root, delivered('l1', 'k1', 's1'), ON);
    appendOutcomeEvent(root, failure('k1', 's1'), ON);
    expect(
      outcomeLogPath(root).replaceAll('\\', '/').endsWith('.agentsmesh/lessons/outcome-log.jsonl'),
    ).toBe(true);
    expect(readOutcomeLog(root)).toEqual([delivered('l1', 'k1', 's1'), failure('k1', 's1')]);
  });
});

describe('loadEffectiveness (ranking scores from the written log)', () => {
  const lesson = (trigger: string): LessonsGraph['lessons'][string] => ({
    rule: 'A rule.',
    topics: ['t'],
    triggers: [trigger],
    evidence: [],
    status: 'active',
    createdAt: '2026-01-01',
  });
  const GRAPH: LessonsGraph = {
    version: 2,
    topics: { t: { summary: 'T.' } },
    triggers: {
      src: { kind: 'file_glob', pattern: 'src/**' },
      docs: { kind: 'file_glob', pattern: 'docs/**' },
    },
    lessons: { l1: lesson('src'), l2: lesson('docs') },
  };
  const minute = (m: number): string => new Date(Date.UTC(2026, 0, 1, 0, m)).toISOString();

  function seedThreeRounds(): void {
    for (const m of [0, 10, 20]) {
      appendOutcomeEvent(root, delivered('l1', 'file:src/x.ts', 's1', minute(m)), ON);
      appendOutcomeEvent(root, delivered('l2', 'file:docs/a.md', 's1', minute(m)), ON);
      appendOutcomeEvent(root, failure('file:src/x.ts', 's1', minute(m + 1)), ON);
    }
  }

  it('scores a lesson whose own trigger kept failing 0, and one that held 1', () => {
    seedThreeRounds();
    const scores = loadEffectiveness(root, GRAPH);
    expect(scores.get('l1')).toBe(0);
    expect(scores.get('l2')).toBe(1);
    expect(scores.get('lX')).toBeUndefined();
  });

  it('loads the graph itself when the caller has none', () => {
    saveLessonsGraph(root, GRAPH);
    seedThreeRounds();
    expect(loadEffectiveness(root).get('l1')).toBe(0);
  });

  it('is empty until the log holds both deliveries and failures', () => {
    appendOutcomeEvent(root, delivered('l1', 'file:src/x.ts', 's1'), ON);
    expect(loadEffectiveness(root, GRAPH).size).toBe(0);
  });
});

describe('record helpers (stamp ts + session, gated on the outcome-log switch)', () => {
  const withSession = {
    AGENTSMESH_LESSONS_TELEMETRY: '1',
    AGENTSMESH_SESSION_ID: 's1',
  } as NodeJS.ProcessEnv;

  it('recordDelivered writes one delivered event per lesson id; no-op when the log is off', () => {
    recordDelivered(root, ['l1', 'l2'], 'file:x', OFF);
    expect(readOutcomeLog(root)).toEqual([]);

    recordDelivered(root, ['l1', 'l2'], 'file:x', withSession);
    const recs = readOutcomeLog(root);
    expect(
      recs.map((r) => ({
        kind: r.kind,
        lessonId: r.kind === 'delivered' ? r.lessonId : undefined,
        contextKey: r.contextKey,
        session: r.session,
      })),
    ).toEqual([
      { kind: 'delivered', lessonId: 'l1', contextKey: 'file:x', session: 's1' },
      { kind: 'delivered', lessonId: 'l2', contextKey: 'file:x', session: 's1' },
    ]);
    expect(typeof recs[0]!.ts).toBe('string');
  });

  it('recordDelivered no-ops on an empty id list', () => {
    recordDelivered(root, [], 'file:x', withSession);
    expect(readOutcomeLog(root)).toEqual([]);
  });

  it('recordFailure writes one failure event; session absent when the env is unset', () => {
    recordFailure(root, 'file:x', undefined, {
      AGENTSMESH_LESSONS_TELEMETRY: '1',
    } as NodeJS.ProcessEnv);
    const recs = readOutcomeLog(root);
    expect(recs.length).toBe(1);
    expect(recs[0]!.kind).toBe('failure');
    expect(recs[0]!.contextKey).toBe('file:x');
    expect(recs[0]!.session).toBeUndefined();
  });

  it('an explicit session argument wins over the env session', () => {
    recordDelivered(root, ['l1'], 'file:x', withSession, 'stdin-s');
    expect(readOutcomeLog(root)[0]!.session).toBe('stdin-s');
  });

  it('recordDelivered stamps each delivered event with its 0-based rank', () => {
    recordDelivered(root, ['l1', 'l2'], 'file:x', withSession);
    const ranks = readOutcomeLog(root).map((r) => (r.kind === 'delivered' ? r.rank : undefined));
    expect(ranks).toEqual([0, 1]);
  });

  it('recordFailure: an explicit session argument wins over the env session', () => {
    recordFailure(root, 'file:x', undefined, withSession, 'stdin-s');
    expect(readOutcomeLog(root)[0]!.session).toBe('stdin-s');
  });

  it('recordFailure carries an error class when provided', () => {
    recordFailure(root, 'cmd:build', 'typeerror: boom', {
      AGENTSMESH_LESSONS_TELEMETRY: '1',
    } as NodeJS.ProcessEnv);
    const rec = readOutcomeLog(root)[0]!;
    expect(rec).toMatchObject({
      kind: 'failure',
      contextKey: 'cmd:build',
      errorClass: 'typeerror: boom',
    });
  });
});

describe('failuresForContext (recurrence history, pure read)', () => {
  const ON = { AGENTSMESH_LESSONS_TELEMETRY: '1' } as NodeJS.ProcessEnv;

  it('counts how often the LATEST error recurred on this action, not every failure', () => {
    recordFailure(root, 'cmd:build', 'error a', ON);
    recordFailure(root, 'file:x', 'error b', ON);
    recordFailure(root, 'cmd:build', 'error b', ON);
    expect(failuresForContext(root, 'cmd:build')).toEqual({ count: 1, lastErrorClass: 'error b' });
    recordFailure(root, 'cmd:build', 'error b', ON);
    expect(failuresForContext(root, 'cmd:build')).toEqual({ count: 2, lastErrorClass: 'error b' });
  });

  it('never claims a recurrence without an error class', () => {
    recordFailure(root, 'cmd:build', undefined, ON);
    recordFailure(root, 'cmd:build', undefined, ON);
    expect(failuresForContext(root, 'cmd:build')).toEqual({ count: 0 });
  });

  it('is zero for an action that has never failed', () => {
    expect(failuresForContext(root, 'cmd:never')).toEqual({ count: 0 });
  });
});
