import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import { appendRecallRecord, type RecallTelemetryRecord } from '../../../src/lessons/telemetry.js';
import { collectHealthFindings, UNUSED_MIN_RECALLS } from '../../../src/lessons/validate-health.js';

const ON = { AGENTSMESH_LESSONS_TELEMETRY: '1' } as NodeJS.ProcessEnv;

const lesson = (
  createdAt: string,
  extra: Partial<LessonsGraph['lessons'][string]> = {},
): LessonsGraph['lessons'][string] => ({
  rule: 'A rule long enough to pass any length gate in the graph schema.',
  topics: ['t'],
  triggers: ['g'],
  evidence: [],
  status: 'active',
  createdAt,
  ...extra,
});

/** Five lessons, only one of which should be reported. */
const GRAPH: LessonsGraph = {
  version: 2,
  lessons: {
    'old-unused': lesson('2026-01-01'),
    'old-used': lesson('2026-01-01'),
    'fresh-unused': lesson('2026-04-15'),
    'always-unused': lesson('2026-01-01', { scope: 'always' }),
    'retired-unused': lesson('2026-01-01', { status: 'deprecated' }),
  },
  topics: { t: { summary: 'T.' } },
  triggers: { g: { kind: 'file_glob', pattern: 'src/**' } },
};

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-unused-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function seedRecalls(
  count: number,
  deliveredIds: readonly string[],
  contextKey: string | null = 'file:src/app.ts',
): void {
  for (let i = 0; i < count; i += 1) {
    const day = String(1 + (i % 28)).padStart(2, '0');
    const record: RecallTelemetryRecord = {
      ts: `2026-03-${day}T00:00:00.000Z`,
      hasFile: true,
      hasCommand: false,
      hasKeyword: false,
      totalMatches: 1,
      returnedCount: i === 0 ? deliveredIds.length : 0,
      returnedTokens: 0,
      truncated: false,
      matchedByKind: { file: 1, command: 0, keyword: 0 },
      ...(contextKey !== null ? { contextKey } : {}),
      ...(i === 0 ? { lessonIds: deliveredIds } : {}),
    };
    appendRecallRecord(root, record, ON);
  }
}

describe('collectHealthFindings: NEVER_RECALLED (recall-log derived)', () => {
  it('reports, in one finding, lessons whose triggers matched touched actions yet never fired', () => {
    seedRecalls(UNUSED_MIN_RECALLS, ['old-used']);
    const findings = collectHealthFindings(root, GRAPH).filter((f) => f.code === 'NEVER_RECALLED');
    expect(findings).toEqual([
      {
        level: 'warning',
        code: 'NEVER_RECALLED',
        lessonIds: ['old-unused'],
        message: expect.stringContaining('old-unused'),
      },
    ]);
    expect(findings[0]!.message).toContain(`${UNUSED_MIN_RECALLS} recalls`);
    expect(findings[0]!.message).toContain('review');
    expect(findings[0]!.message).not.toContain('deprecate');
  });

  it('does not flag a lesson just because its trigger paths were not touched', () => {
    seedRecalls(UNUSED_MIN_RECALLS, ['old-used'], 'file:docs/readme.md');
    expect(collectHealthFindings(root, GRAPH).some((f) => f.code === 'NEVER_RECALLED')).toBe(false);
  });

  it('does not flag anything when recalls carry no action key', () => {
    seedRecalls(UNUSED_MIN_RECALLS, ['old-used'], null);
    expect(collectHealthFindings(root, GRAPH).some((f) => f.code === 'NEVER_RECALLED')).toBe(false);
  });

  it('stays silent until the log holds enough recalls to judge', () => {
    seedRecalls(UNUSED_MIN_RECALLS - 1, ['old-used']);
    expect(collectHealthFindings(root, GRAPH).some((f) => f.code === 'NEVER_RECALLED')).toBe(false);
  });

  it('stays silent with no recall log, even when an outcome log is absent too', () => {
    expect(collectHealthFindings(root, GRAPH)).toEqual([]);
  });
});
