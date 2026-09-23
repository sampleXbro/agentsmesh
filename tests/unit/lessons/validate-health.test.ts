import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import {
  appendOutcomeEvent,
  readOutcomeLog,
  type OutcomeEvent,
} from '../../../src/lessons/outcome-log.js';
import { collectHealthFindings } from '../../../src/lessons/validate-health.js';

const ON = { AGENTSMESH_LESSONS_TELEMETRY: '1' } as NodeJS.ProcessEnv;

const GRAPH: LessonsGraph = {
  version: 2,
  lessons: {
    l1: {
      rule: 'ineffective one',
      topics: ['t'],
      triggers: ['g'],
      evidence: [],
      status: 'active',
      createdAt: '2026-01-01',
    },
    cov: {
      rule: 'covers src',
      topics: ['t'],
      triggers: ['g'],
      evidence: [],
      status: 'active',
      createdAt: '2026-01-01',
    },
  },
  topics: { t: { summary: 'T.' } },
  triggers: { g: { kind: 'file_glob', pattern: 'src/**' } },
};

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-health-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const seed = (events: OutcomeEvent[]): void => {
  for (const e of events) appendOutcomeEvent(root, e, ON);
};
const at = (minutes: number): string =>
  new Date(Date.parse('2026-01-01T00:00:00Z') + minutes * 60_000).toISOString();
const d = (lessonId: string, contextKey: string, minutes = 0): OutcomeEvent => ({
  ts: at(minutes),
  kind: 'delivered',
  lessonId,
  contextKey,
  session: 's1',
});
const f = (contextKey: string, minutes = 0): OutcomeEvent => ({
  ts: at(minutes),
  kind: 'failure',
  contextKey,
  session: 's1',
});

describe('collectHealthFindings (MAINTAIN, log-derived, warning-level)', () => {
  it('is empty when the outcome log is absent', () => {
    expect(collectHealthFindings(root, GRAPH)).toEqual([]);
  });

  it('flags a lesson delivered 3× and missed every time as INEFFECTIVE_LESSON — a review hint', () => {
    // Each delivery is followed within minutes by a failure its own src/** glob matches.
    seed([
      d('l1', 'file:src/a.ts', 0),
      f('file:src/a.ts', 1),
      d('l1', 'file:src/b.ts', 60),
      f('file:src/b.ts', 61),
      d('l1', 'file:src/a.ts', 120),
      f('file:src/a.ts', 121),
    ]);
    const findings = collectHealthFindings(root, GRAPH);
    expect(findings).toEqual([
      {
        level: 'warning',
        code: 'INEFFECTIVE_LESSON',
        lessonId: 'l1',
        message: expect.stringContaining('Delivered 3×'),
      },
    ]);
    expect(findings[0]!.message).toContain('2 distinct failing actions');
    expect(findings[0]!.message).toContain('review this lesson');
    expect(findings[0]!.message).not.toContain('deprecate');
  });

  it('does NOT flag a lesson whose later failures are outside its triggers (the cmd:cd case)', () => {
    seed([
      d('l1', 'cmd:cd', 0),
      f('cmd:cd', 1),
      d('l1', 'cmd:cd', 60),
      f('cmd:cd', 61),
      d('l1', 'cmd:cd', 120),
      f('cmd:cd', 121),
    ]);
    expect(
      collectHealthFindings(root, GRAPH).filter((x) => x.code === 'INEFFECTIVE_LESSON'),
    ).toEqual([]);
  });

  it('does NOT flag a lesson whose failures came hours later', () => {
    seed([
      d('l1', 'file:src/a.ts', 0),
      d('l1', 'file:src/a.ts', 1),
      d('l1', 'file:src/a.ts', 2),
      f('file:src/a.ts', 400),
    ]);
    expect(collectHealthFindings(root, GRAPH)).toEqual([]);
  });

  it('does NOT flag a lesson that helped at least once', () => {
    seed([
      d('l1', 'file:src/a.ts', 0),
      f('file:src/a.ts', 1),
      d('l1', 'file:src/a.ts', 60),
      f('file:src/a.ts', 61),
      d('l1', 'file:src/a.ts', 120), // never repeated
    ]);
    expect(collectHealthFindings(root, GRAPH)).toEqual([]);
  });

  it('flags a repeat failure with no covering lesson as UNCOVERED_FAILURE', () => {
    seed([f('file:docs/gap.ts'), f('file:docs/gap.ts')]);
    expect(collectHealthFindings(root, GRAPH)).toEqual([
      {
        level: 'warning',
        code: 'UNCOVERED_FAILURE',
        message: expect.stringContaining('Failed 2× at file:docs/gap.ts'),
      },
    ]);
  });

  it('does NOT flag a repeat failure that an active lesson already covers', () => {
    seed([f('file:src/x.ts'), f('file:src/x.ts')]); // src/** is covered by lesson `cov`
    expect(collectHealthFindings(root, GRAPH)).toEqual([]);
  });

  it('does NOT flag a single (non-recurring) failure', () => {
    seed([f('file:docs/gap.ts')]);
    expect(collectHealthFindings(root, GRAPH)).toEqual([]);
  });

  it('does NOT flag a repeat cmd: failure — the normalized command class cannot be coverage-checked', () => {
    // cmd: keys store the lossy command class; a command_pattern trigger on the full
    // command can't be re-matched against it, so validate never claims cmd UNCOVERED.
    seed([f('cmd:some tool'), f('cmd:some tool')]);
    // The failures ARE persisted (2 of them) — they are just deliberately not flagged.
    expect(readOutcomeLog(root).filter((e) => e.kind === 'failure')).toHaveLength(2);
    expect(collectHealthFindings(root, GRAPH)).toEqual([]);
  });
});
