/**
 * `lessons add` run from a folder below the project root reads `--trigger-file`
 * from that folder, tells the user when it moved a glob, and a later recall
 * from the root finds the lesson.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runLessons } from '../../../../src/cli/commands/lessons.js';
import { loadLessonsGraph, saveLessonsGraph } from '../../../../src/lessons/graph-store.js';

let root: string;
let web: string;
const RULE = 'Restart vite after you edit its config file.';

function patterns(): string[] {
  return Object.values(loadLessonsGraph(root).triggers).map((t) => t.pattern);
}

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'am-add-cwd-')));
  web = join(root, 'packages', 'web');
  mkdirSync(web, { recursive: true });
  mkdirSync(join(root, '.git'));
  writeFileSync(join(web, 'vite.config.ts'), '');
  writeFileSync(join(root, 'package.json'), '{}');
  saveLessonsGraph(root, {
    version: 2,
    lessons: {},
    topics: { web: { summary: 'Web.' } },
    triggers: {},
  });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('lessons add — --trigger-file typed in a subfolder', () => {
  it('saves a project-relative glob, says so, and recall from the root finds it', async () => {
    const r = await runLessons(
      { topic: 'web', 'trigger-file': 'vite.config.ts' },
      ['add', RULE],
      web,
    );
    expect(r.exitCode).toBe(0);
    expect(patterns()).toEqual(['packages/web/vite.config.ts']);
    if (r.subcommand !== 'add') throw new Error('expected an add result');
    expect(r.data.warnings).toEqual([
      {
        code: 'TRIGGER_GLOB_REBASED',
        message:
          'trigger glob "vite.config.ts" rebased to packages/web/vite.config.ts (relative to the current folder)',
      },
    ]);

    const recall = await runLessons({ file: 'packages/web/vite.config.ts' }, ['query'], root);
    if (recall.subcommand !== 'query') throw new Error('expected a query result');
    expect(recall.data.lessons.map((l) => l.rule)).toEqual([RULE]);
  });

  it('keeps a glob that already exists from the root, with no note', async () => {
    const r = await runLessons(
      { topic: 'web', 'trigger-file': 'package.json' },
      ['add', RULE],
      web,
    );
    expect(r.exitCode).toBe(0);
    expect(patterns()).toEqual(['package.json']);
    if (r.subcommand !== 'add') throw new Error('expected an add result');
    expect(r.data.warnings.map((w) => w.code)).not.toContain('TRIGGER_GLOB_REBASED');
  });

  it('does not move anything when run from the root', async () => {
    const r = await runLessons(
      { topic: 'web', 'trigger-file': 'packages/web/vite.config.ts' },
      ['add', RULE],
      root,
    );
    expect(r.exitCode).toBe(0);
    expect(patterns()).toEqual(['packages/web/vite.config.ts']);
    if (r.subcommand !== 'add') throw new Error('expected an add result');
    expect(r.data.warnings).toEqual([]);
  });

  it('names each glob it moved', async () => {
    const r = await runLessons(
      { topic: 'web', 'trigger-file': ['vite.config.ts', 'package.json', 'later.ts'] },
      ['add', RULE],
      web,
    );
    expect(r.exitCode).toBe(0);
    expect(patterns().sort()).toEqual([
      'package.json',
      'packages/web/later.ts',
      'packages/web/vite.config.ts',
    ]);
    if (r.subcommand !== 'add') throw new Error('expected an add result');
    const moved = r.data.warnings.filter((w) => w.code === 'TRIGGER_GLOB_REBASED');
    expect(moved.map((w) => w.message)).toEqual([
      'trigger glob "vite.config.ts" rebased to packages/web/vite.config.ts (relative to the current folder)',
      'trigger glob "later.ts" rebased to packages/web/later.ts (relative to the current folder)',
    ]);
  });
});
