/**
 * MCP recall on an unreadable graph returns no lessons and logs the reason on
 * stderr with the same wording as the CLI: a merge conflict points at
 * `lessons resolve`, never at a generic "corrupt".
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpContext } from '../../../../src/mcp/context.js';
import { lessonsHandlers } from '../../../../src/mcp/handlers/lessons.js';
import { CONFLICTED_GRAPH_TEXT, writeGraphText } from '../../../helpers/lessons-graph-fixture.js';

let root: string;
let stderr: string[];

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'amesh-mcp-unreadable-'));
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

describe('lessons_query on an unreadable graph', () => {
  it('names a merge conflict and points at lessons resolve', async () => {
    writeGraphText(root, CONFLICTED_GRAPH_TEXT);
    const ctx = { projectRoot: root } as McpContext;
    const out = await lessonsHandlers.query(ctx, { file: 'src/x.ts' });
    expect(out.lessons).toEqual([]);
    const log = stderr.join('');
    expect(log).toMatch(/recall returned no lessons: .*merge conflict/);
    expect(log).toContain('agentsmesh lessons resolve');
  });
});
