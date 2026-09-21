/**
 * Lessons tools must work in a repo that has no `agentsmesh.yaml`.
 *
 * The CLI already does: `lessons query` in a bare repo prints a setup hint and
 * exits 0, and `lessons add` creates the graph. The MCP surface hard-failed the
 * same call with `NO_PROJECT`, so an agent reaching lessons over MCP — the
 * documented path for an agent with no shell, and the only path a Claude Code
 * plugin has — could not use the feature at all until someone ran
 * `agentsmesh init` first.
 *
 * Config tools still require a project; lessons are self-contained by design.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

  it('falls back to the working directory when a project is optional', async () => {
    const ctx = await resolveContext({ cwd: dir, requireProject: false });
    expect(ctx.projectRoot).toBe(dir);
    expect(existsSync(join(dir, 'agentsmesh.yaml'))).toBe(false);
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

  it('captures a lesson, creating the graph where none existed', async () => {
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
