import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { doStats } from '../../../src/cli/commands/lessons-handlers.js';
import { captureLogPath, readCaptureLog } from '../../../src/lessons/capture-telemetry.js';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import { saveLessonsGraph } from '../../../src/lessons/graph-store.js';
import { outcomeLogPath, readOutcomeLog } from '../../../src/lessons/outcome-log.js';
import { readRecallLog, recallLogPath, TELEMETRY_ENV } from '../../../src/lessons/telemetry.js';
import { collectHealthFindings } from '../../../src/lessons/validate-health.js';

/**
 * A lessons log is plain text that can be hand-edited, merged or committed, so
 * a line that parses but is not a record (`null`, a number, a record missing a
 * field) must be skipped by its reader — never crash the hook, stats or validate.
 */

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-log-guards-'));
  vi.stubEnv(TELEMETRY_ENV, '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

const JUNK = ['null', '7', '"text"', '[1,2]', 'true', '{}'];

function writeLog(path: string, rows: readonly unknown[], junk = JUNK): void {
  mkdirSync(dirname(path), { recursive: true });
  const lines = [...junk, ...rows.map((r) => JSON.stringify(r))];
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8');
}

const delivered = { ts: '2026-01-01T00:00:00Z', kind: 'delivered', lessonId: 'a', contextKey: 'k' };
const failure = { ts: '2026-01-01T00:00:01Z', kind: 'failure', contextKey: 'k', errorClass: 'e' };
const recall = {
  ts: '2026-01-01T00:00:00Z',
  hasFile: true,
  hasCommand: false,
  hasKeyword: false,
  totalMatches: 1,
  returnedCount: 1,
  returnedTokens: 9,
  truncated: false,
  matchedByKind: { file: 1, command: 0, keyword: 0 },
  lessonIds: ['a'],
};
const capture = {
  ts: '2026-01-01T00:00:00Z',
  isNewLesson: true,
  isNewTopic: false,
  newTriggerCount: 1,
  triggerKinds: { file: 1, command: 0, keyword: 0 },
  blocked: false,
  warningCodes: [],
  lessonId: 'a',
};

describe('readOutcomeLog', () => {
  it('keeps valid events and skips non-objects and events missing required fields', () => {
    const broken = [
      { kind: 'delivered', lessonId: 'a', contextKey: 'k' },
      { ...delivered, lessonId: undefined },
      { ...delivered, contextKey: 3 },
      { ...failure, kind: 'other' },
      { ...failure, ts: null },
      { ...failure, session: 5 },
    ];
    writeLog(outcomeLogPath(root), [delivered, ...broken, failure]);
    expect(readOutcomeLog(root)).toEqual([delivered, failure]);
  });
});

describe('readRecallLog', () => {
  it('keeps valid records and skips non-objects and records missing required fields', () => {
    const broken = [
      { ...recall, totalMatches: undefined },
      { ...recall, matchedByKind: null },
      { ...recall, matchedByKind: { file: 1 } },
      { ...recall, lessonIds: 'a' },
      { ...recall, ts: 1 },
    ];
    const legacy = { ...recall, lessonIds: undefined };
    writeLog(recallLogPath(root), [recall, ...broken, legacy]);
    expect(readRecallLog(root)).toEqual([recall, JSON.parse(JSON.stringify(legacy))]);
  });
});

describe('readCaptureLog', () => {
  it('keeps valid records and skips non-objects and records missing required fields', () => {
    const broken = [
      { ...capture, blocked: undefined },
      { ...capture, triggerKinds: null },
      { ...capture, warningCodes: 'W' },
      { ...capture, lessonId: 4 },
    ];
    writeLog(captureLogPath(root), [capture, ...broken]);
    expect(readCaptureLog(root)).toEqual([capture]);
  });
});

const graph: LessonsGraph = {
  version: 2,
  lessons: {
    a: {
      rule: 'Rule.',
      topics: ['t'],
      triggers: ['a-t'],
      evidence: [],
      status: 'active',
      createdAt: '2026-06-05',
    },
  },
  topics: { t: { summary: 'T.' } },
  triggers: { 'a-t': { kind: 'file_glob', pattern: 'src/**' } },
};

describe('log consumers on a log holding junk lines', () => {
  beforeEach(() => {
    saveLessonsGraph(root, graph);
    writeLog(outcomeLogPath(root), [delivered, failure]);
    writeLog(recallLogPath(root), [recall]);
    writeLog(captureLogPath(root), [capture]);
  });

  it('lessons stats counts only the valid records', () => {
    const result = doStats({}, root);
    if (result.subcommand !== 'stats') throw new Error('expected stats');
    expect(result.exitCode).toBe(0);
    expect(result.data.report.totalRecalls).toBe(1);
    expect(result.data.captureReport.total).toBe(1);
    expect(result.data.effectiveness.deliveries).toBe(1);
    expect(result.data.effectiveness.failuresObserved).toBe(1);
  });

  it('validate health findings do not throw', () => {
    expect(() => collectHealthFindings(root, graph)).not.toThrow();
  });
});
