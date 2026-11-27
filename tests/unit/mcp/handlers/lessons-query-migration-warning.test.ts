/**
 * `lessons_query` on a legacy store that cannot be migrated returns no lessons
 * AND a `warning` naming the failed migration, worded like the CLI. Recall used
 * to swallow the migration error, so an MCP agent read "no match" and went on
 * with recall off. The stderr line stays.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpContext } from '../../../../src/mcp/context.js';
import { lessonsHandlers } from '../../../../src/mcp/handlers/lessons.js';

const WARNING =
  'recall returned no lessons: the legacy lessons store (.agentsmesh/lessons/index.yaml) ' +
  'could not be migrated: Legacy topic file path is outside .agentsmesh/lessons/: ' +
  '../outside.md. Refusing to migrate (legacy artifacts left intact). Fix it, then run ' +
  '`agentsmesh lessons import-md`.';

let root: string;
let ctx: McpContext;
let stderr: string[];
const indexPath = (): string => join(root, '.agentsmesh', 'lessons', 'index.yaml');

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-mcp-migration-warning-'));
  ctx = { projectRoot: root } as McpContext;
  mkdirSync(join(root, '.agentsmesh', 'lessons'), { recursive: true });
  writeFileSync(
    indexPath(),
    [
      'version: 1',
      'clusters:',
      '  - topic: leak',
      '    file: "../outside.md"',
      '    summary: Leak topic.',
      '    triggers:',
      '      file_globs: ["src/**"]',
      '      command_patterns: []',
      '      keywords: []',
      '',
    ].join('\n'),
  );
  stderr = [];
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderr.push(String(chunk));
    return true;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe('lessons_query after a failed legacy migration', () => {
  it('returns no lessons and a warning that names the failed migration', async () => {
    const out = await lessonsHandlers.query(ctx, { file: 'src/x.ts' });
    expect(out).toEqual({ lessons: [], totalMatches: 0, warning: WARNING });
    expect(existsSync(indexPath())).toBe(true);
  });

  it('keeps the stderr line, worded the same as the warning', async () => {
    await lessonsHandlers.query(ctx, { file: 'src/x.ts' });
    expect(stderr.join('')).toContain(`agentsmesh: ${WARNING}\n`);
  });

  it('warns for an always-only recall too', async () => {
    const out = await lessonsHandlers.query(ctx, { always: true });
    expect(out.lessons).toEqual([]);
    expect(out.warning).toBe(WARNING);
  });

  it('has no warning when there is no legacy store', async () => {
    rmSync(join(root, '.agentsmesh'), { recursive: true, force: true });
    const out = await lessonsHandlers.query(ctx, { file: 'src/x.ts' });
    expect(out).toEqual({ lessons: [], totalMatches: 0 });
  });
});
