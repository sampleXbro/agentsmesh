import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { doStats } from '../../../../src/cli/commands/lessons-handlers.js';
import type { LessonsStatsData } from '../../../../src/cli/commands/lessons-types.js';
import type { LessonsGraph } from '../../../../src/lessons/graph-schema.js';
import { saveLessonsGraph } from '../../../../src/lessons/graph-store.js';
import { appendRecallRecord, TELEMETRY_ENV } from '../../../../src/lessons/telemetry.js';
import { appendCaptureRecord } from '../../../../src/lessons/capture-telemetry.js';
import { appendOutcomeEvent } from '../../../../src/lessons/outcome-log.js';

let root: string;
const on = { [TELEMETRY_ENV]: '1' };

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-stats-cmd-'));
  // Hermetic: doStats reads telemetry state from the live process env, so pin it
  // OFF here instead of inheriting an ambient AGENTSMESH_LESSONS_TELEMETRY=1.
  vi.stubEnv(TELEMETRY_ENV, '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

const graph: LessonsGraph = {
  version: 1,
  lessons: {
    kw: {
      rule: 'Keyword-only rule.',
      topics: ['t'],
      triggers: ['t-kw'],
      evidence: [],
      status: 'active',
      createdAt: '2026-06-01',
    },
  },
  topics: { t: { summary: 'T.' } },
  triggers: { 't-kw': { kind: 'keyword', pattern: 'x' } },
};

function statsData(result: ReturnType<typeof doStats>): LessonsStatsData {
  if (result.subcommand !== 'stats') throw new Error('expected stats');
  return result.data;
}

describe('doStats', () => {
  it('reports hasLog=false and zeroed totals when telemetry never ran', () => {
    saveLessonsGraph(root, graph);
    const data = statsData(doStats({}, root));
    expect(data.hasLog).toBe(false);
    // Default test env has telemetry off, so the renderer shows the "enable it" hint.
    expect(data.telemetryEnabled).toBe(false);
    expect(data.report.totalRecalls).toBe(0);
    // The graph still yields the static reachability gap.
    expect(data.report.reachability.keywordOnlyUnreachableLessons).toBe(1);
  });

  it('reports hasOutcomeLog=false with a neutral effectiveness block when no outcome log exists', () => {
    saveLessonsGraph(root, graph);
    const data = statsData(doStats({}, root));
    expect(data.hasOutcomeLog).toBe(false);
    expect(data.effectiveness).toEqual({
      deliveries: 0,
      lessonsDelivered: 0,
      failuresObserved: 0,
      misses: 0,
      failingActions: 0,
      heldRate: 1,
      ineffectiveLessons: 0,
    });
  });

  it('summarizes the benefit side from the outcome log', () => {
    // A miss needs a failure on an action the lesson's own trigger matches.
    saveLessonsGraph(root, {
      ...graph,
      lessons: { ...graph.lessons, fg: { ...graph.lessons.kw!, triggers: ['t-fg'] } },
      triggers: { ...graph.triggers, 't-fg': { kind: 'file_glob', pattern: 'src/**' } },
    });
    appendOutcomeEvent(
      root,
      {
        ts: '2026-01-01T00:00:00Z',
        kind: 'delivered',
        lessonId: 'fg',
        contextKey: 'file:src/x.ts',
        session: 's1',
      },
      on,
    );
    appendOutcomeEvent(
      root,
      { ts: '2026-01-01T00:00:01Z', kind: 'failure', contextKey: 'file:src/x.ts', session: 's1' },
      on,
    );
    const data = statsData(doStats({}, root));
    expect(data.hasOutcomeLog).toBe(true);
    expect(data.effectiveness.deliveries).toBe(1);
    expect(data.effectiveness.failuresObserved).toBe(1);
    expect(data.effectiveness.heldRate).toBe(0); // delivered, then the same action failed
  });

  it('reports telemetryEnabled=true when the env opts in', () => {
    vi.stubEnv(TELEMETRY_ENV, '1');
    saveLessonsGraph(root, graph);
    expect(statsData(doStats({}, root)).telemetryEnabled).toBe(true);
  });

  it('summarizes a recorded log against the graph', () => {
    saveLessonsGraph(root, graph);
    appendRecallRecord(
      root,
      {
        ts: '2026-06-07T00:00:00.000Z',
        hasFile: true,
        hasCommand: false,
        hasKeyword: false,
        totalMatches: 0,
        returnedCount: 0,
        returnedTokens: 0,
        truncated: false,
        matchedByKind: { file: 0, command: 0, keyword: 0 },
      },
      on,
    );
    const data = statsData(doStats({}, root));
    expect(data.hasLog).toBe(true);
    expect(data.report.totalRecalls).toBe(1);
    expect(data.report.noMatchRate).toBe(1);
  });

  it('reports hasCaptureLog=false and a zeroed capture report when no capture ran', () => {
    saveLessonsGraph(root, graph);
    const data = statsData(doStats({}, root));
    expect(data.hasCaptureLog).toBe(false);
    expect(data.captureReport.total).toBe(0);
  });

  it('summarizes a recorded capture log alongside the recall report', () => {
    saveLessonsGraph(root, graph);
    appendCaptureRecord(
      root,
      {
        ts: '2026-06-11T00:00:00.000Z',
        isNewLesson: true,
        isNewTopic: false,
        newTriggerCount: 1,
        triggerKinds: { file: 1, command: 0, keyword: 0 },
        blocked: false,
        warningCodes: [],
      },
      on,
    );
    appendCaptureRecord(
      root,
      {
        ts: '2026-06-11T00:01:00.000Z',
        isNewLesson: false,
        isNewTopic: false,
        newTriggerCount: 0,
        triggerKinds: { file: 0, command: 0, keyword: 1 },
        blocked: true,
        warningCodes: [],
      },
      on,
    );
    const data = statsData(doStats({}, root));
    expect(data.hasCaptureLog).toBe(true);
    expect(data.captureReport.total).toBe(2);
    expect(data.captureReport.blocked).toBe(1);
    expect(data.captureReport.newLessons).toBe(1);
    expect(data.captureReport.byTriggerKind).toEqual({ file: 1, command: 0, keyword: 1 });
  });

  it('honors --json by selecting the json format', () => {
    saveLessonsGraph(root, graph);
    const result = doStats({ json: true }, root);
    expect(result.subcommand === 'stats' && result.format).toBe('json');
  });

  it('does not throw on a project with no lessons graph', () => {
    const data = statsData(doStats({}, root)); // no saveLessonsGraph
    expect(data.hasLog).toBe(false);
    expect(data.report.totalRecalls).toBe(0);
    expect(data.report.reachability.keywordOnlyUnreachableLessons).toBe(0);
  });
});
