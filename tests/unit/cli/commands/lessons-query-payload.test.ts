/**
 * `lessons query` output limits.
 *
 * - The plain output is capped at MAX_RECALL_PAYLOAD_CHARS. Rules cut by that
 *   cap were still marked as seen, so with `--session` the agent never got them.
 *   Only what is printed may count as delivered.
 * - `--always` returned every always-on lesson with no budget; the hook and MCP
 *   use DEFAULT_ALWAYS_MAX_TOKENS.
 * - A merge conflict must point at `lessons resolve`, not a generic "corrupt".
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runLessons } from '../../../../src/cli/commands/lessons.js';
import type { LessonsQueryData } from '../../../../src/cli/commands/lessons-types.js';
import type { LessonsGraph } from '../../../../src/lessons/graph-schema.js';
import { saveLessonsGraph } from '../../../../src/lessons/graph-store.js';
import { DEFAULT_ALWAYS_MAX_TOKENS } from '../../../../src/lessons/recall-always.js';
import { MAX_RECALL_PAYLOAD_CHARS } from '../../../../src/lessons/rule-line.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lessons-payload-'));
  vi.stubEnv('AGENTSMESH_SESSION_ID', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

function seed(count: number, ruleChars: number, scope?: 'always'): void {
  const lessons: LessonsGraph['lessons'] = {};
  for (let i = 0; i < count; i += 1) {
    lessons[`l${String(i).padStart(2, '0')}`] = {
      rule: `Rule ${i} `.padEnd(ruleChars, 'x'),
      topics: ['t'],
      triggers: scope === 'always' ? [] : ['g'],
      evidence: [],
      status: 'active',
      createdAt: '2026-01-01',
      ...(scope === 'always' ? { scope } : {}),
    };
  }
  saveLessonsGraph(root, {
    version: 2,
    topics: { t: { summary: 'T' } },
    triggers: { g: { kind: 'file_glob', pattern: 'src/**' } },
    lessons,
  });
}

async function query(flags: Record<string, string | boolean>): Promise<LessonsQueryData> {
  const r = await runLessons(flags, ['query'], root);
  if (r.subcommand !== 'query') throw new Error(`unexpected ${r.subcommand}`);
  return r.data;
}

const chars = (d: LessonsQueryData): number => d.lessons.reduce((n, l) => n + l.rule.length, 0);

describe('lessons query payload cap', () => {
  it('returns only what fits the cap, and a later call in the session gets the rest', async () => {
    seed(30, 2000);
    const flags = { file: 'src/x.ts', all: true, session: 'payload-s1' };
    const first = await query(flags);
    expect(first.lessons.length).toBeGreaterThan(0);
    expect(first.lessons.length).toBeLessThan(30);
    expect(chars(first)).toBeLessThanOrEqual(MAX_RECALL_PAYLOAD_CHARS);
    const second = await query(flags);
    expect(second.suppressed).toBe(first.lessons.length);
    expect(second.lessons.map((l) => l.id)).not.toContain(first.lessons[0]!.id);
    expect(second.lessons.length).toBeGreaterThan(0);
  });

  it('keeps the full list for --json, which the cap does not cut', async () => {
    seed(30, 2000);
    const data = await query({ file: 'src/x.ts', all: true, format: 'json' });
    expect(data.lessons).toHaveLength(30);
  });

  it('bounds --always by the always-on token budget', async () => {
    seed(20, 400, 'always');
    const data = await query({ always: true });
    expect(data.lessons.length).toBe(Math.floor((DEFAULT_ALWAYS_MAX_TOKENS * 4) / 400));
  });
});

describe('lessons query on a conflicted graph', () => {
  it('names the merge conflict and points at lessons resolve', async () => {
    mkdirSync(join(root, '.agentsmesh', 'lessons'), { recursive: true });
    writeFileSync(
      join(root, '.agentsmesh', 'lessons', 'lessons.json'),
      '{\n<<<<<<< HEAD\n  "a": 1\n=======\n  "b": 2\n>>>>>>> theirs\n}\n',
    );
    const data = await query({ file: 'src/x.ts' });
    expect(data.lessons).toEqual([]);
    expect(data.warning).toMatch(/merge conflict/);
    expect(data.warning).toMatch(/lessons resolve/);
  });
});
