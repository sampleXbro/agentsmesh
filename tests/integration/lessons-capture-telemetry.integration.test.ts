import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { doAdd } from '../../src/cli/commands/lessons-write-handlers.js';
import { captureLesson } from '../../src/lessons/capture.js';
import { readCaptureLog } from '../../src/lessons/capture-telemetry.js';
import { loadLessonsGraph, saveLessonsGraph } from '../../src/lessons/graph-store.js';
import { lessonsPaths } from '../../src/lessons/paths.js';
import { TELEMETRY_ENV } from '../../src/lessons/telemetry.js';
import type { LessonsGraph } from '../../src/lessons/graph-schema.js';

let root: string;

function seed(): void {
  const graph: LessonsGraph = {
    version: 1,
    lessons: {},
    topics: { t: { summary: 'T.' } },
    triggers: {},
  };
  saveLessonsGraph(root, graph);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-cap-tel-int-'));
  seed();
  process.env[TELEMETRY_ENV] = '1';
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  delete process.env[TELEMETRY_ENV];
});

describe('capture telemetry — both entry points record', () => {
  it('records a capture from the CLI doAdd path AND the captureLesson (MCP) path', async () => {
    // 1) CLI path — doAdd routes through captureLesson, so it must record.
    const cli = await doAdd({ topic: 't', 'trigger-file': ['src/cli.ts'] }, 'CLI rule.', root);
    expect(cli.exitCode).toBe(0);

    // 2) MCP/app path — captureLesson directly.
    await captureLesson(root, {
      rule: 'MCP rule.',
      topic: 't',
      triggers: { files: ['src/mcp.ts'] },
    });

    const rows = readCaptureLog(root);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.blocked === false)).toBe(true);
    expect(rows.every((r) => r.isNewLesson === true)).toBe(true);
    expect(rows.map((r) => r.triggerKinds.file)).toEqual([1, 1]);
  });

  it('warns PENDING_GLOB (not DEAD_GLOB) when captureLesson is given a glob matching no file', async () => {
    // No `src/` tree and no git history to prove a rename: the path may not exist yet.
    const r = await captureLesson(root, {
      rule: 'Lesson with a missing glob.',
      topic: 't',
      triggers: { files: ['src/renamed/**/*.ts'] },
    });
    const codes = r.warnings.map((w) => w.code);
    expect(codes).toContain('PENDING_GLOB');
    expect(codes).not.toContain('DEAD_GLOB');
  });

  it('auto-prunes orphan cruft after a capture when config opts in, and surfaces the summary', async () => {
    // Seed an orphan trigger (referenced only by a superseded lesson) + an
    // orphan topic, then opt into auto-prune.
    const seeded: LessonsGraph = {
      version: 1,
      lessons: {
        sup: {
          rule: 'Old rule.',
          topics: ['t'],
          triggers: ['t-orphan'],
          evidence: [],
          status: 'deprecated',
          createdAt: '2026-06-01',
        },
      },
      topics: { t: { summary: 'T.' }, gone: { summary: 'Orphan topic.' } },
      triggers: { 't-orphan': { kind: 'file_glob', pattern: 'src/x.ts' } },
    };
    saveLessonsGraph(root, seeded);
    mkdirSync(join(root, '.agentsmesh/lessons'), { recursive: true });
    writeFileSync(lessonsPaths(root).config, JSON.stringify({ autoPrune: true }), 'utf8');

    const r = await doAdd({ topic: 't', 'trigger-file': ['src/new.ts'] }, 'Fresh rule.', root);
    expect(r.exitCode).toBe(0);
    if (r.subcommand !== 'add') throw new Error('expected add');
    expect(r.data.autoPruned).toEqual({
      removedTriggers: 1,
      removedTopics: 1,
      detachedDeadGlobs: 0,
    });

    const graph = loadLessonsGraph(root);
    expect(Object.keys(graph.triggers)).not.toContain('t-orphan');
    expect(Object.keys(graph.topics)).not.toContain('gone');
  });

  it('records a BLOCKED capture (unrecallable) before rethrowing', async () => {
    const blocked = await doAdd(
      { topic: 't', 'trigger-kw': ['state of the art'] },
      'Dead rule.',
      root,
    );
    expect(blocked.exitCode).toBe(2);

    const rows = readCaptureLog(root);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      blocked: true,
      isNewLesson: false,
      triggerKinds: { file: 0, command: 0, keyword: 1 },
    });
  });
});
