import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runLessons } from '../../../../src/cli/commands/lessons.js';
import type { LessonsFlags } from '../../../../src/cli/commands/lessons-helpers.js';
import type { LessonsGraph } from '../../../../src/lessons/graph-schema.js';
import {
  graphFilePath,
  loadLessonsGraph,
  saveLessonsGraph,
  serializeGraph,
} from '../../../../src/lessons/graph-store.js';
import { lessonsPaths } from '../../../../src/lessons/paths.js';
import {
  CONFLICTED_GRAPH_TEXT,
  lesson,
  writeGraphText,
} from '../../../helpers/lessons-graph-fixture.js';

let project: string;
let sub: string;

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'am-subdir-'));
  sub = join(project, 'src', 'db');
  mkdirSync(sub, { recursive: true });
});
afterEach(() => rmSync(project, { recursive: true, force: true }));

const SEED: LessonsGraph = {
  version: 2,
  lessons: {
    'db-seed': {
      rule: 'Run migrations in a transaction.',
      topics: ['db'],
      triggers: ['g'],
      evidence: [],
      status: 'active',
      createdAt: '2026-01-01',
    },
  },
  topics: { db: { summary: 'DB.' } },
  triggers: { g: { kind: 'file_glob', pattern: 'src/db/**' } },
};

/** A fully set-up lessons project (graph + config) at `project`. */
function seedProject(): void {
  saveLessonsGraph(project, SEED);
  writeFileSync(lessonsPaths(project).config, '{}\n');
}

describe('lessons run from a subdirectory act on the enclosing project', () => {
  it('query recalls the project lessons with no stray-dir warning', async () => {
    seedProject();
    const r = await runLessons({ file: 'src/db/migrate.ts' }, ['query'], sub);
    if (r.subcommand !== 'query') throw new Error('expected query');
    expect(r.exitCode).toBe(0);
    expect(r.data.lessons.map((l) => l.id)).toEqual(['db-seed']);
    expect(r.data.warning).toBeUndefined();
  });

  it('validate reports the project graph problem (no false green)', async () => {
    writeGraphText(project, CONFLICTED_GRAPH_TEXT);
    const r = await runLessons({}, ['validate'], sub);
    if (r.subcommand !== 'validate') throw new Error('expected validate');
    expect(r.exitCode).toBe(1);
    expect(r.data.findings.map((f) => f.code)).toEqual(['MERGE_CONFLICT']);
  });

  it('topics and journal list the project entries without the setup hint', async () => {
    seedProject();
    const topics = await runLessons({}, ['topics'], sub);
    if (topics.subcommand !== 'topics') throw new Error('expected topics');
    expect(topics.data).toEqual({ topics: [{ id: 'db', summary: 'DB.' }] });
    const journal = await runLessons({}, ['journal'], sub);
    if (journal.subcommand !== 'journal') throw new Error('expected journal');
    expect(journal.data.entries.map((e) => e.id)).toEqual(['db-seed']);
    expect(journal.data.setupHint).toBeUndefined();
  });

  const failedWrites: Array<[string, LessonsFlags, string[]]> = [
    ['add (unknown topic)', { topic: 'nope', 'trigger-file': 'src/**' }, ['add', 'R.']],
    ['deprecate (unknown id)', {}, ['deprecate', 'nope']],
    ['merge (unknown id)', {}, ['merge', 'nope', 'db-seed']],
    ['untrigger (unknown id)', {}, ['untrigger', 'nope', 'g']],
  ];

  it.each(failedWrites)('%s fails without a stray .agentsmesh in the subdir', async (_n, f, a) => {
    seedProject();
    const before = readFileSync(graphFilePath(project), 'utf8');
    const r = await runLessons(f, a, sub);
    expect(r.exitCode).toBe(1);
    expect(existsSync(join(sub, '.agentsmesh'))).toBe(false);
    expect(readFileSync(graphFilePath(project), 'utf8')).toBe(before);
  });

  it('add writes to the project graph', async () => {
    seedProject();
    const r = await runLessons(
      { topic: 'db', 'trigger-file': 'src/db/**' },
      ['add', 'Name migrations by date.'],
      sub,
    );
    if (r.subcommand !== 'add') throw new Error('expected add');
    expect(r.exitCode).toBe(0);
    expect(Object.keys(loadLessonsGraph(project).lessons).sort()).toEqual([
      'db-name-migrations-by-date',
      'db-seed',
    ]);
    expect(existsSync(join(sub, '.agentsmesh'))).toBe(false);
  });

  it('resolve unions a conflict in the project graph', async () => {
    const side = (rule: string): string =>
      serializeGraph({
        version: 2,
        lessons: { [rule.slice(0, 1).toLowerCase()]: lesson(rule) },
        topics: { t: { summary: 'T.' } },
        triggers: {},
      }).trimEnd();
    writeGraphText(project, `<<<<<<< HEAD\n${side('A.')}\n=======\n${side('B.')}\n>>>>>>> x\n`);
    const r = await runLessons({}, ['resolve'], sub);
    if (r.subcommand !== 'resolve') throw new Error('expected resolve');
    expect(r.exitCode).toBe(0);
    expect(r.data.source).toBe('markers');
    expect(Object.keys(loadLessonsGraph(project).lessons).sort()).toEqual(['a', 'b']);
  });

  it('keeps the current directory when no lessons project is up the tree', async () => {
    const r = await runLessons(
      { topic: 't', 'new-topic': true, 'topic-summary': 'T.', 'trigger-file': 'src/**' },
      ['add', 'Local rule.'],
      sub,
    );
    expect(r.exitCode).toBe(0);
    expect(existsSync(graphFilePath(sub))).toBe(true);
    expect(existsSync(graphFilePath(project))).toBe(false);
  });
});
