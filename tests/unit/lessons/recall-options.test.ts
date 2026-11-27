import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveLessonsGraph } from '../../../src/lessons/graph-store.js';
import { recallLessons } from '../../../src/lessons/recall.js';
import { readRecallLog, TELEMETRY_ENV } from '../../../src/lessons/telemetry.js';
import { bulkLessonsGraph } from '../../helpers/lessons-graph-fixture.js';

/** `all` (diagnostic dump) and `trim` (last cut before dedup) on recallLessons. */

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-recall-options-'));
  vi.stubEnv('AGENTSMESH_SESSION_ID', '');
  vi.stubEnv(TELEMETRY_ENV, '1');
  saveLessonsGraph(root, bulkLessonsGraph(30, 2000));
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

const query = { file: 'src/x.ts' };

describe('recallLessons — all', () => {
  it('skips the limit and the token budget', async () => {
    const capped = await recallLessons(root, query, { limit: 2 });
    expect(capped.lessons).toHaveLength(2);
    const all = await recallLessons(root, query, { limit: 2, all: true });
    expect(all.lessons).toHaveLength(30);
    expect(all.totalMatches).toBe(30);
  });

  it('is recorded as a bypass in recall telemetry', async () => {
    await recallLessons(root, query, { all: true });
    await recallLessons(root, query);
    expect(readRecallLog(root).map((r) => r.bypassed)).toEqual([true, false]);
  });
});

describe('recallLessons — trim', () => {
  it('returns, commits and records only what trim keeps', async () => {
    const options = {
      sessionId: 'trim-s1',
      all: true,
      trim: <T>(rows: T[]): T[] => rows.slice(0, 4),
    };
    const first = await recallLessons(root, query, options);
    expect(first.lessons.map((l) => l.id)).toEqual(['l00', 'l01', 'l02', 'l03']);
    expect(readRecallLog(root).map((r) => r.returnedCount)).toEqual([4]);

    const second = await recallLessons(root, query, { ...options, trim: undefined });
    expect(second.suppressed).toBe(4);
    expect(second.lessons.map((l) => l.id)).not.toContain('l00');
    expect(second.lessons).toHaveLength(26);
  });

  it('hands trim the ranked lessons in rank order', async () => {
    const seen: string[][] = [];
    await recallLessons(root, query, {
      limit: 3,
      maxTokens: null,
      trim: (rows) => {
        seen.push(rows.map((l) => l.id));
        return rows;
      },
    });
    expect(seen).toEqual([['l00', 'l01', 'l02']]);
  });
});
