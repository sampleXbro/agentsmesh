/**
 * `lessons_query` on a graph it cannot read returns no lessons AND a `warning`
 * string. An MCP-only agent cannot see stderr, so without the field it would
 * read "no match" and carry on with recall off. The stderr line stays.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveLessonsGraph } from '../../../../src/lessons/graph-store.js';
import type { McpContext } from '../../../../src/mcp/context.js';
import { lessonsHandlers } from '../../../../src/mcp/handlers/lessons.js';
import { CONFLICTED_GRAPH_TEXT, writeGraphText } from '../../../helpers/lessons-graph-fixture.js';

let root: string;
let ctx: McpContext;
let stderr: string[];

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'amesh-mcp-query-warning-'));
  ctx = { projectRoot: root } as McpContext;
  stderr = [];
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderr.push(String(chunk));
    return true;
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

const NEWER = '{"version":99,"lessons":{},"topics":{},"triggers":{}}';
const BAD_SCHEMA = '{"version":2,"lessons":{"a":{"rule":""}},"topics":{},"triggers":{}}';

const UNREADABLE: Array<[string, string, RegExp]> = [
  ['a merge conflict', CONFLICTED_GRAPH_TEXT, /merge conflict.*agentsmesh lessons resolve/s],
  ['unparseable JSON', '{ not json', /could not be parsed/],
  ['a newer schema version', NEWER, /is version 99, newer than this agentsmesh supports/],
  ['a schema mismatch', BAD_SCHEMA, /does not match the lessons schema/],
];

describe('lessons_query warning on an unreadable graph', () => {
  it.each(UNREADABLE)(
    'names the problem for %s and still returns no lessons',
    async (_n, text, re) => {
      writeGraphText(root, text);
      const out = await lessonsHandlers.query(ctx, { file: 'src/x.ts' });
      expect(out.lessons).toEqual([]);
      expect(out.totalMatches).toBe(0);
      expect(out.warning).toMatch(/^recall returned no lessons: /);
      expect(out.warning).toMatch(re);
    },
  );

  it('keeps the stderr line, worded the same as the warning', async () => {
    writeGraphText(root, CONFLICTED_GRAPH_TEXT);
    const out = await lessonsHandlers.query(ctx, { file: 'src/x.ts' });
    expect(stderr.join('')).toContain(`agentsmesh: ${out.warning}\n`);
  });

  it('warns for an always-only recall too', async () => {
    writeGraphText(root, CONFLICTED_GRAPH_TEXT);
    const out = await lessonsHandlers.query(ctx, { always: true });
    expect(out.lessons).toEqual([]);
    expect(out.warning).toMatch(/^recall returned no lessons: .*merge conflict/);
  });
});

describe('lessons_query without a warning', () => {
  it('has no warning field when the graph reads fine', async () => {
    saveLessonsGraph(root, {
      version: 2,
      lessons: {
        'keep-green': {
          rule: 'Keep the build green.',
          topics: ['t'],
          triggers: ['g'],
          evidence: [],
          status: 'active',
          createdAt: '2026-01-01',
        },
      },
      topics: { t: { summary: 'T.' } },
      triggers: { g: { kind: 'file_glob', pattern: 'src/**' } },
    });
    const out = await lessonsHandlers.query(ctx, { file: 'src/x.ts', no_dedup: true });
    expect(out.lessons).toEqual([{ id: 'keep-green', rule: 'Keep the build green.' }]);
    expect(out).not.toHaveProperty('warning');
  });

  it('has no warning field when no graph exists', async () => {
    const out = await lessonsHandlers.query(ctx, { file: 'src/x.ts' });
    expect(out).toEqual({ lessons: [], totalMatches: 0 });
  });
});
