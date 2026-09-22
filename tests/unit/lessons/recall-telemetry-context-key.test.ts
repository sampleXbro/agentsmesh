/**
 * The recall log needs the action key, or effectiveness has no denominator.
 *
 * Today the log records `hasFile` / `hasCommand` booleans, so we know a recall
 * happened but not for which action. The outcome log records the action for
 * deliveries and failures only. Without a per-action occurrence count, a
 * before/after claim about a lesson preventing anything is not computable —
 * which is exactly why `lessons stats` calls its own held-rate a weak upper
 * bound rather than proof.
 *
 * The key stored is the same normalized `contextKey` the outcome log already
 * persists (`cmd:git commit`, `file:src/x.ts`), so this adds no new content to
 * the log — it is never raw text.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recallLessons } from '../../../src/lessons/recall.js';
import { graphFilePath } from '../../../src/lessons/graph-store.js';
import { lessonsPaths } from '../../../src/lessons/paths.js';

const ON = '1';
let root: string;
let prev: string | undefined;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-recall-key-'));
  const g = graphFilePath(root);
  mkdirSync(join(root, '.agentsmesh/lessons'), { recursive: true });
  writeFileSync(
    g,
    JSON.stringify({
      version: 2,
      topics: { t: { summary: 't' } },
      triggers: { 'glob-src': { kind: 'file_glob', pattern: 'src/**' } },
      lessons: {
        l1: {
          rule: 'careful in src',
          topics: ['t'],
          triggers: ['glob-src'],
          evidence: [],
          status: 'active',
          createdAt: '2026-01-01',
        },
      },
    }),
  );
  prev = process.env.AGENTSMESH_LESSONS_TELEMETRY;
  process.env.AGENTSMESH_LESSONS_TELEMETRY = ON;
});

afterEach(() => {
  if (prev === undefined) delete process.env.AGENTSMESH_LESSONS_TELEMETRY;
  else process.env.AGENTSMESH_LESSONS_TELEMETRY = prev;
  rmSync(root, { recursive: true, force: true });
});

function records(): Array<Record<string, unknown>> {
  const p = join(lessonsPaths(root).base, 'recall-log.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

describe('recall telemetry records the action key', () => {
  it('stores the normalized file key', async () => {
    await recallLessons(root, { file: 'src/app.ts' }, { sessionId: 's1' });
    expect(records().at(-1)?.contextKey).toBe('file:src/app.ts');
  });

  it('stores the normalized command class, never the raw command', async () => {
    await recallLessons(root, { command: 'git commit -m "secret message"' }, { sessionId: 's1' });
    const key = records().at(-1)?.contextKey as string;
    expect(key).toBe('cmd:git commit');
    expect(key).not.toContain('secret message');
  });

  it('records an occurrence even when nothing matched', async () => {
    await recallLessons(root, { file: 'unrelated/file.txt' }, { sessionId: 's1' });
    const last = records().at(-1);
    expect(last?.totalMatches).toBe(0);
    expect(last?.contextKey).toBe('file:unrelated/file.txt');
  });

  it('marks a keyword-only recall as having no action key', async () => {
    await recallLessons(root, { keyword: 'some task text' }, { sessionId: 's1' });
    expect(records().at(-1)?.contextKey).toBe('none');
  });

  it('lets occurrences per action be counted, which is the denominator', async () => {
    await recallLessons(root, { file: 'src/app.ts' }, { sessionId: 's1' });
    await recallLessons(root, { file: 'src/app.ts' }, { sessionId: 's2' });
    await recallLessons(root, { file: 'src/other.ts' }, { sessionId: 's3' });

    const counts = new Map<string, number>();
    for (const r of records()) {
      const k = String(r.contextKey);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    expect(counts.get('file:src/app.ts')).toBe(2);
    expect(counts.get('file:src/other.ts')).toBe(1);
  });
});
