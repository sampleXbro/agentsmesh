import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_RULE_LENGTH } from '../../../../src/lessons/graph-schema.js';
import { saveLessonsGraph } from '../../../../src/lessons/graph-store.js';
import { MAX_RECALL_PAYLOAD_CHARS } from '../../../../src/lessons/rule-line.js';
import type { McpContext } from '../../../../src/mcp/context.js';
import { lessonsHandlers } from '../../../../src/mcp/handlers/lessons.js';
import type { LessonsShowTopicResult } from '../../../../src/mcp/handlers/lessons-curation.js';
import { bulkLessonsGraph } from '../../../helpers/lessons-graph-fixture.js';

let root: string;
let ctx: McpContext;

const ruleChars = (lessons: ReadonlyArray<{ rule: string }>): number =>
  lessons.reduce((n, l) => n + l.rule.length, 0);

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'amesh-mcp-cap-'));
  ctx = { projectRoot: root } as McpContext;
  vi.stubEnv('AGENTSMESH_LESSONS_TELEMETRY', '');
  vi.stubEnv('AGENTSMESH_SESSION_ID', '');
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

describe('lessons_query payload bounds', () => {
  it('clamps a single over-long rule', async () => {
    saveLessonsGraph(root, bulkLessonsGraph(1, MAX_RULE_LENGTH * 20));
    const out = await lessonsHandlers.query(ctx, { file: 'src/x.ts', no_dedup: true });
    expect(out.lessons[0]?.rule.length).toBe(MAX_RULE_LENGTH);
    expect(out.lessons[0]?.rule.endsWith('…[truncated]')).toBe(true);
  });

  it('keeps the total rule payload under the cap even with a huge token budget', async () => {
    saveLessonsGraph(root, bulkLessonsGraph(40, MAX_RULE_LENGTH));
    const out = await lessonsHandlers.query(ctx, {
      file: 'src/x.ts',
      limit: 100,
      max_tokens: 1_000_000,
      no_dedup: true,
    });
    expect(ruleChars(out.lessons)).toBeLessThanOrEqual(MAX_RECALL_PAYLOAD_CHARS);
    expect(out.lessons.length).toBeGreaterThan(1);
    expect(out.totalMatches).toBe(40);
  });

  it('does not mark capped-out lessons as seen: they come back on the next call', async () => {
    saveLessonsGraph(root, bulkLessonsGraph(40, MAX_RULE_LENGTH));
    const session = `cap-${process.pid}-${Date.now()}`;
    const q = { file: 'src/x.ts', limit: 100, max_tokens: 1_000_000, session };
    const first = await lessonsHandlers.query(ctx, q);
    const second = await lessonsHandlers.query(ctx, q);
    expect(second.lessons.length).toBeGreaterThan(0);
    const ids = new Set(first.lessons.map((l) => l.id));
    expect(second.lessons.every((l) => !ids.has(l.id))).toBe(true);
  });
});

/** The topic view of lessons_show (a lesson id returns a single lesson instead). */
async function showTopic(topic: string): Promise<LessonsShowTopicResult> {
  const out = await lessonsHandlers.show(ctx, { topic });
  if (!('lessons' in out)) throw new Error(`expected the topic view of ${topic}`);
  return out;
}

describe('lessons_show payload bounds', () => {
  it('clamps each rule and caps the total, reporting how many it left out', async () => {
    saveLessonsGraph(root, bulkLessonsGraph(40, MAX_RULE_LENGTH * 3));
    const out = await showTopic('t');
    expect(out.lessons.every((l) => l.rule.length <= MAX_RULE_LENGTH)).toBe(true);
    expect(ruleChars(out.lessons)).toBeLessThanOrEqual(MAX_RECALL_PAYLOAD_CHARS);
    expect(out.omitted).toBe(40 - out.lessons.length);
    expect(out.omitted).toBeGreaterThan(0);
  });

  it('reports nothing omitted for a small topic', async () => {
    saveLessonsGraph(root, bulkLessonsGraph(2, 10));
    const out = await showTopic('t');
    expect(out.lessons.length).toBe(2);
    expect(out.omitted).toBeUndefined();
  });

  it('reaches a lesson the cap left out by its id', async () => {
    saveLessonsGraph(root, bulkLessonsGraph(40, MAX_RULE_LENGTH * 3));
    const shown = new Set((await showTopic('t')).lessons.map((l) => l.id));
    const cut = Object.keys(bulkLessonsGraph(40, 1).lessons).find((id) => !shown.has(id));
    expect(cut).toBeDefined();
    const one = await lessonsHandlers.show(ctx, { topic: cut! });
    expect(one).toMatchObject({ lesson: { id: cut, status: 'active', topics: ['t'] } });
    expect('lesson' in one && one.lesson.rule.length).toBe(MAX_RULE_LENGTH);
  });
});
