/**
 * On an unreadable graph every lessons tool that reads it before answering
 * fails with the shared diagnosis (`problemFromLoad`) — a merge conflict
 * points at `lessons resolve`, a newer version at an upgrade — never with raw
 * parser text or a schema dump. The code is VALIDATION_FAILED with the same
 * finding code as `lessons validate`. Nothing is written, and no git runs.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpContext } from '../../../../src/mcp/context.js';
import { McpError } from '../../../../src/mcp/errors.js';
import { lessonsHandlers } from '../../../../src/mcp/handlers/lessons.js';
import { problemFromLoad } from '../../../../src/lessons/graph-problem.js';
import { graphFilePath, loadLessonsGraphResilient } from '../../../../src/lessons/graph-store.js';
import { runGit } from '../../../../src/lessons/git-exec.js';
import { CONFLICTED_GRAPH_TEXT, writeGraphText } from '../../../helpers/lessons-graph-fixture.js';

vi.mock('../../../../src/lessons/git-exec.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/lessons/git-exec.js')>();
  return { ...actual, runGit: vi.fn(actual.runGit) };
});

let root: string;
let ctx: McpContext;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-mcp-unreadable-graph-'));
  ctx = { projectRoot: root } as McpContext;
  vi.stubEnv('AGENTSMESH_LESSONS_TELEMETRY', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(runGit).mockClear();
  rmSync(root, { recursive: true, force: true });
});

const GRAPHS: Array<[string, string, string, RegExp]> = [
  ['a merge conflict', CONFLICTED_GRAPH_TEXT, 'MERGE_CONFLICT', /agentsmesh lessons resolve/],
  ['corrupt JSON', '{ "version": 2, ', 'CORRUPT_GRAPH', /could not be parsed/],
  [
    'a newer version',
    '{"version":99,"lessons":{},"topics":{},"triggers":{}}',
    'NEWER_GRAPH_VERSION',
    /Upgrade/,
  ],
  [
    'a schema-invalid graph',
    '{"version":2,"lessons":[],"topics":{},"triggers":{}}',
    'SCHEMA_INVALID',
    /does not match the lessons schema/,
  ],
];

const CALLS: Array<[string, (c: McpContext) => Promise<unknown>]> = [
  ['lessons_topics', (c) => lessonsHandlers.topics(c)],
  ['lessons_show', (c) => lessonsHandlers.show(c, { topic: 't' })],
  [
    'lessons_add',
    (c) =>
      lessonsHandlers.add(c, {
        rule: 'Quote every path.',
        topic: 't',
        new_topic: true,
        topic_summary: 'T.',
        trigger_files: 'src/**',
      }),
  ],
  ['lessons_deprecate', (c) => lessonsHandlers.deprecate(c, { id: 'x' })],
];

describe.each(GRAPHS)('on %s', (_label, text, code, hint) => {
  it.each(CALLS)('%s fails with the shared diagnosis', async (_tool, call) => {
    writeGraphText(root, text);
    const problem = problemFromLoad(root, loadLessonsGraphResilient(root));
    expect(problem).not.toBeNull();
    const err = await call(ctx).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(McpError);
    expect((err as McpError).code).toBe('VALIDATION_FAILED');
    expect((err as McpError).message).toBe(problem!.message);
    expect((err as McpError).message).toMatch(hint);
    expect((err as McpError).details).toEqual({ code });
    expect(readFileSync(graphFilePath(root), 'utf8')).toBe(text);
  });
});

describe('a readable graph', () => {
  it('is read by lessons_topics and lessons_show without running git', async () => {
    writeGraphText(
      root,
      '{"version":2,"lessons":{},"topics":{"t":{"summary":"T."}},"triggers":{}}',
    );
    expect(await lessonsHandlers.topics(ctx)).toEqual({ topics: [{ id: 't', summary: 'T.' }] });
    expect(await lessonsHandlers.show(ctx, { topic: 't' })).toEqual({
      topic: 't',
      summary: 'T.',
      lessons: [],
    });
    expect(runGit).not.toHaveBeenCalled();
  });
});
