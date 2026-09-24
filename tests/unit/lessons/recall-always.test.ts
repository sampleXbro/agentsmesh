import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Lesson, LessonsGraph } from '../../../src/lessons/graph-schema.js';
import { saveLessonsGraph } from '../../../src/lessons/graph-store.js';
import { recallAlwaysLessons } from '../../../src/lessons/recall-always.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-always-'));
  vi.stubEnv('AGENTSMESH_LESSONS_TELEMETRY', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

const always = (rule: string, createdAt = '2026-06-05'): Lesson => ({
  rule,
  topics: ['t'],
  triggers: [],
  evidence: [],
  status: 'active',
  scope: 'always',
  createdAt,
});
function graphWith(lessons: Record<string, Lesson>): LessonsGraph {
  return { version: 2, lessons, topics: { t: { summary: 'T.' } }, triggers: {} };
}

describe('recallAlwaysLessons', () => {
  it('returns [] when no graph exists', async () => {
    expect(await recallAlwaysLessons(root)).toEqual({ lessons: [], total: 0, suppressed: 0 });
  });

  it('returns active always-lessons newest-first', async () => {
    saveLessonsGraph(
      root,
      graphWith({
        old: always('Old rule.', '2026-06-01'),
        fresh: always('Fresh rule.', '2026-06-10'),
      }),
    );
    const r = await recallAlwaysLessons(root);
    expect(r.lessons.map((l) => l.rule)).toEqual(['Fresh rule.', 'Old rule.']);
    expect(r.total).toBe(2);
  });

  it('excludes non-always and deprecated lessons', async () => {
    saveLessonsGraph(
      root,
      graphWith({
        dead: { ...always('Dead.'), status: 'deprecated' },
        normal: {
          rule: 'Normal.',
          topics: ['t'],
          triggers: [],
          evidence: [],
          status: 'active',
          createdAt: '2026-06-05',
        },
      }),
    );
    expect((await recallAlwaysLessons(root)).lessons).toEqual([]);
  });

  it('caps by token budget but always keeps the first, and reports the true total', async () => {
    saveLessonsGraph(
      root,
      graphWith({
        a: always('A'.repeat(40), '2026-06-10'),
        b: always('B'.repeat(40), '2026-06-05'),
      }),
    );
    const r = await recallAlwaysLessons(root, { maxTokens: 1 });
    expect(r.lessons).toHaveLength(1);
    expect(r.total).toBe(2);
  });

  it('maxTokens:null disables the budget (returns all)', async () => {
    saveLessonsGraph(
      root,
      graphWith({
        a: always('A'.repeat(40), '2026-06-10'),
        b: always('B'.repeat(40), '2026-06-05'),
      }),
    );
    expect((await recallAlwaysLessons(root, { maxTokens: null })).lessons).toHaveLength(2);
  });
});

describe('recallAlwaysLessons — session dedup', () => {
  const session = 'always-dedup-session';

  it('suppresses a repeat in the same session and counts it', async () => {
    saveLessonsGraph(root, graphWith({ a: always('A rule.') }));
    await recallAlwaysLessons(root, { sessionId: session });
    const again = await recallAlwaysLessons(root, { sessionId: session });
    expect(again).toEqual({ lessons: [], total: 1, suppressed: 1 });
  });

  it('noDedup returns lessons already delivered and marks nothing', async () => {
    saveLessonsGraph(root, graphWith({ a: always('A rule.') }));
    const first = await recallAlwaysLessons(root, { sessionId: session, noDedup: true });
    expect(first.lessons).toEqual([{ id: 'a', rule: 'A rule.' }]);
    // Nothing was marked seen, so the deduped path still delivers it once.
    expect((await recallAlwaysLessons(root, { sessionId: session })).lessons).toHaveLength(1);
    const forced = await recallAlwaysLessons(root, { sessionId: session, noDedup: true });
    expect(forced).toEqual({ lessons: [{ id: 'a', rule: 'A rule.' }], total: 1, suppressed: 0 });
  });
});
