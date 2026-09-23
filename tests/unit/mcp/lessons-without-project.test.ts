/**
 * Lessons tools run in a directory with no `agentsmesh.yaml`.
 *
 * The MCP surface once hard-failed every lessons call with `NO_PROJECT`, so an
 * agent reaching lessons over MCP — the documented path for an agent with no
 * shell, and the only path a Claude Code plugin has — could not recall at all.
 * Reads now work anywhere. A capture needs a home for the graph: a directory
 * that already holds lessons, or an agentsmesh project; elsewhere it is
 * refused (see lessons-root.test.ts).
 *
 * Config tools still require a project.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { resolveContext } from '../../../src/mcp/context.js';
import { LESSONS_TOOL_DESCRIPTORS } from '../../../src/mcp/tool-tables/lessons-tools.js';
import { TOOL_DESCRIPTORS } from '../../../src/mcp/register.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'amesh-mcp-noproject-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('MCP context without a project', () => {
  it('still throws NO_PROJECT when a project is required', async () => {
    await expect(resolveContext({ cwd: dir, requireProject: true })).rejects.toThrow(
      /agentsmesh\.yaml not found/,
    );
  });

  it('resolves with no lessons root when a project is optional and none exists', async () => {
    const ctx = await resolveContext({ cwd: dir, requireProject: false });
    expect(ctx.lessonsRoot).toBeNull();
    expect(existsSync(join(dir, 'agentsmesh.yaml'))).toBe(false);
  });

  it('resolves to the directory holding the graph when started in a subdirectory', async () => {
    // A plugin-only repo has no agentsmesh.yaml, so without a lessons-aware
    // fallback a server started in `packages/app` read and wrote a second,
    // empty graph there: recall missed every real lesson and captures split.
    mkdirSync(join(dir, '.agentsmesh', 'lessons'), { recursive: true });
    writeFileSync(join(dir, '.agentsmesh', 'lessons', 'lessons.json'), '{}');
    const pkg = join(dir, 'packages', 'app');
    mkdirSync(pkg, { recursive: true });
    const ctx = await resolveContext({ cwd: pkg, requireProject: false });
    expect(ctx.lessonsRoot).toBe(resolve(dir));
  });

  it('defaults to requiring a project, so config tools are unaffected', async () => {
    await expect(resolveContext({ cwd: dir })).rejects.toThrow(/agentsmesh\.yaml not found/);
  });
});

describe('tool descriptors', () => {
  it('marks every lessons tool as usable without a project', () => {
    for (const d of LESSONS_TOOL_DESCRIPTORS) {
      expect(d.projectOptional, `${d.name} should not require a project`).toBe(true);
    }
  });

  it('leaves every non-lessons tool requiring a project', () => {
    const lessons = new Set(LESSONS_TOOL_DESCRIPTORS.map((d) => d.name));
    const others = TOOL_DESCRIPTORS.filter((d) => !lessons.has(d.name));
    expect(others.length).toBeGreaterThan(0);
    for (const d of others) {
      expect(d.projectOptional ?? false, `${d.name} should require a project`).toBe(false);
    }
  });
});

describe('lessons over MCP in a bare repo', () => {
  it('queries without error and reports no matches', async () => {
    const ctx = await resolveContext({ cwd: dir, requireProject: false });
    const query = LESSONS_TOOL_DESCRIPTORS.find((d) => d.name === 'lessons_query')!;
    const out = (await query.handler(ctx, { file: 'src/a.ts' })) as { lessons: unknown[] };
    expect(out.lessons).toEqual([]);
  });

  it('captures a lesson once lessons are set up, creating the graph', async () => {
    // `init --lessons` seeds config.json; the graph comes with the first capture.
    mkdirSync(join(dir, '.agentsmesh', 'lessons'), { recursive: true });
    writeFileSync(join(dir, '.agentsmesh', 'lessons', 'config.json'), '{}');
    const ctx = await resolveContext({ cwd: dir, requireProject: false });
    const add = LESSONS_TOOL_DESCRIPTORS.find((d) => d.name === 'lessons_add')!;
    await add.handler(ctx, {
      rule: 'Prefer pnpm in this repository.',
      topic: 'tooling',
      new_topic: true,
      topic_summary: 'Tooling choices',
      trigger_file: 'package.json',
    });
    expect(existsSync(join(dir, '.agentsmesh/lessons/lessons.json'))).toBe(true);
  });
});
