/**
 * The lessons tools resolve their root exactly like the MCP instructions and
 * the recall hook: the nearest directory holding lessons, else the nearest
 * agentsmesh project, else none. They never use the home directory: a graph
 * there is recalled in every folder under it and leaks rules across projects.
 * With no root, reads are empty and writes are refused without touching disk.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveContext, type McpContext } from '../../../src/mcp/context.js';
import { LESSONS_TOOL_DESCRIPTORS } from '../../../src/mcp/tool-tables/lessons-tools.js';
import { saveLessonsGraph, graphFilePath } from '../../../src/lessons/graph-store.js';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';

const fakeHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: (): string => fakeHome.dir };
});

let root: string;
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'amesh-mcp-lroot-')));
  fakeHome.dir = join(root, 'home');
  mkdirSync(fakeHome.dir, { recursive: true });
  vi.stubEnv('AGENTSMESH_LESSONS_TELEMETRY', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

const GRAPH: LessonsGraph = {
  version: 2,
  lessons: {
    'repo-rule': {
      rule: 'Normalize CLI paths before printing.',
      topics: ['paths'],
      triggers: ['g'],
      evidence: [],
      status: 'active',
      createdAt: '2026-06-01',
    },
  },
  topics: { paths: { summary: 'Paths.' } },
  triggers: { g: { kind: 'file_glob', pattern: 'src/cli/**' } },
};

const ADD = {
  rule: 'Always quote paths in shell commands.',
  topic: 'paths',
  new_topic: true,
  topic_summary: 'Paths.',
  trigger_files: 'src/cli/foo.ts',
};

function tool(name: string): (ctx: McpContext, input: unknown) => Promise<unknown> {
  const d = LESSONS_TOOL_DESCRIPTORS.find((t) => t.name === name);
  if (d === undefined) throw new Error(`no tool ${name}`);
  return d.handler;
}

async function lessonsCtx(cwd: string): Promise<McpContext> {
  mkdirSync(cwd, { recursive: true });
  return resolveContext({ cwd, requireProject: false });
}

function projectAt(dir: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'agentsmesh.yaml'), 'version: 1\ntargets: []\nfeatures: []\n');
}

const NO_PROJECT = {
  code: 'NO_PROJECT',
  message: expect.stringContaining('run `agentsmesh init --lessons` in your project'),
};

describe('lessons tools outside any project', () => {
  it('refuses lessons_add in the home directory and writes nothing there', async () => {
    const ctx = await lessonsCtx(fakeHome.dir);
    await expect(tool('lessons_add')(ctx, ADD)).rejects.toMatchObject(NO_PROJECT);
    expect(existsSync(join(fakeHome.dir, '.agentsmesh'))).toBe(false);
  });

  it('refuses lessons_add and lessons_deprecate in a bare directory', async () => {
    const bare = join(root, 'bare');
    const ctx = await lessonsCtx(bare);
    await expect(tool('lessons_add')(ctx, ADD)).rejects.toMatchObject(NO_PROJECT);
    await expect(tool('lessons_deprecate')(ctx, { id: 'repo-rule' })).rejects.toMatchObject(
      NO_PROJECT,
    );
    expect(existsSync(join(bare, '.agentsmesh'))).toBe(false);
  });

  it('answers the read tools with empty results', async () => {
    const ctx = await lessonsCtx(join(root, 'bare'));
    expect(await tool('lessons_query')(ctx, { file: 'src/cli/a.ts' })).toEqual({
      lessons: [],
      totalMatches: 0,
    });
    expect(await tool('lessons_query')(ctx, { always: true })).toEqual({
      lessons: [],
      totalMatches: 0,
    });
    expect(await tool('lessons_topics')(ctx, {})).toEqual({ topics: [] });
    await expect(tool('lessons_show')(ctx, { topic: 'paths' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('does not recall or extend a stray graph in the home directory', async () => {
    saveLessonsGraph(fakeHome.dir, GRAPH);
    const before = readFileSync(graphFilePath(fakeHome.dir), 'utf8');
    const ctx = await lessonsCtx(join(fakeHome.dir, 'work', 'plain'));
    const out = (await tool('lessons_query')(ctx, { file: 'src/cli/a.ts' })) as {
      lessons: unknown[];
    };
    expect(out.lessons).toEqual([]);
    expect(await tool('lessons_topics')(ctx, {})).toEqual({ topics: [] });
    await expect(tool('lessons_add')(ctx, ADD)).rejects.toMatchObject(NO_PROJECT);
    expect(readFileSync(graphFilePath(fakeHome.dir), 'utf8')).toBe(before);
  });
});

describe('lessons tools inside a project', () => {
  it('captures into an agentsmesh project that has no lessons yet', async () => {
    const proj = join(fakeHome.dir, 'work', 'proj');
    projectAt(proj);
    saveLessonsGraph(fakeHome.dir, GRAPH);
    const ctx = await lessonsCtx(join(proj, 'src'));
    await tool('lessons_add')(ctx, ADD);
    expect(existsSync(graphFilePath(proj))).toBe(true);
    const out = (await tool('lessons_query')(ctx, { file: 'src/cli/foo.ts' })) as {
      lessons: Array<{ rule: string }>;
    };
    expect(out.lessons.map((l) => l.rule)).toEqual(['Always quote paths in shell commands.']);
  });

  it('uses the repository lessons from a nested package with its own config', async () => {
    const repo = join(root, 'repo');
    saveLessonsGraph(repo, GRAPH);
    const app = join(repo, 'packages', 'app');
    projectAt(app);
    const ctx = await lessonsCtx(app);
    expect(await tool('lessons_topics')(ctx, {})).toEqual({
      topics: [{ id: 'paths', summary: 'Paths.' }],
    });
    const out = (await tool('lessons_query')(ctx, { file: 'src/cli/a.ts' })) as {
      lessons: Array<{ id: string }>;
    };
    expect(out.lessons.map((l) => l.id)).toEqual(['repo-rule']);
    await tool('lessons_add')(ctx, { ...ADD, new_topic: undefined, topic_summary: undefined });
    expect(existsSync(graphFilePath(app))).toBe(false);
    expect(Object.keys(JSON.parse(readFileSync(graphFilePath(repo), 'utf8')).lessons)).toHaveLength(
      2,
    );
  });
});
