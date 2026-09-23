import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runLessons } from '../../../../src/cli/commands/lessons.js';
import type { LessonsResolveData } from '../../../../src/cli/commands/lessons-types.js';
import type { Lesson, LessonsGraph } from '../../../../src/lessons/graph-schema.js';
import { serializeGraph } from '../../../../src/lessons/graph-store.js';
import { lesson } from '../../../helpers/lessons-graph-fixture.js';
import {
  clearEnv,
  commitAll,
  git,
  GIT_HOOK_ENV,
  initRepo,
  writeFile,
} from '../../../helpers/temp-git-repo.js';

const GRAPH = '.agentsmesh/lessons/lessons.json';
const graph = (lessons: Record<string, Lesson>, version = 2): string =>
  serializeGraph({
    version,
    lessons,
    topics: { t: { summary: 'T.' } },
    triggers: {},
  } as LessonsGraph);

let repo: string;

/** Two branches each add a different lesson; merging them without the driver conflicts. */
function conflictedRepo(project: string, theirsVersion = 2): void {
  initRepo(repo);
  writeFile(project, GRAPH, graph({ l0: lesson('Base.') }));
  commitAll(repo, 'base');
  git(repo, ['checkout', '-q', '-b', 'feature']);
  writeFile(project, GRAPH, graph({ b: lesson('Theirs B.'), l0: lesson('Base.') }, theirsVersion));
  commitAll(repo, 'theirs');
  git(repo, ['checkout', '-q', 'main']);
  writeFile(project, GRAPH, graph({ a: lesson('Ours A.'), l0: lesson('Base.') }));
  commitAll(repo, 'ours');
  const merge = spawnSync('git', ['merge', '--no-edit', 'feature'], {
    cwd: repo,
    encoding: 'utf8',
  });
  expect(merge.status).not.toBe(0);
}

async function resolve(
  project: string,
): Promise<{ exitCode: number; data: LessonsResolveData; error?: string }> {
  const r = await runLessons({}, ['resolve'], project);
  if (r.subcommand !== 'resolve') throw new Error(`expected resolve, got ${r.subcommand}`);
  return r;
}

const rules = (project: string): string[] =>
  Object.values((JSON.parse(readFileSync(join(project, GRAPH), 'utf8')) as LessonsGraph).lessons)
    .map((l) => l.rule)
    .sort();

let restoreEnv: () => void;
beforeAll(() => {
  restoreEnv = clearEnv(GIT_HOOK_ENV);
});
afterAll(() => restoreEnv());
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'am-resolve-'));
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('lessons resolve — from the git index stages', () => {
  it('unions both branches, leaves staging to the user, and counts each side', async () => {
    conflictedRepo(repo);
    expect(readFileSync(join(repo, GRAPH), 'utf8')).toMatch(/^<{7} /m);

    const r = await resolve(repo);
    expect(r.error).toBeUndefined();
    expect(r.exitCode).toBe(0);
    expect(r.data).toEqual({
      source: 'index',
      path: GRAPH,
      lessonCount: 3,
      onlyOurs: 1,
      onlyTheirs: 1,
      introduced: [],
    });
    expect(rules(repo)).toEqual(['Base.', 'Ours A.', 'Theirs B.']);
    expect(git(repo, ['ls-files', '-u', '--', GRAPH]).trim()).not.toBe('');
  });

  it('works for a project that lives in a subdirectory of the repository', async () => {
    const project = join(repo, 'packages', 'app');
    conflictedRepo(project);
    const r = await resolve(project);
    expect(r.exitCode).toBe(0);
    expect(rules(project)).toEqual(['Base.', 'Ours A.', 'Theirs B.']);
  });

  it('refuses and keeps the file when the incoming side has a newer schema', async () => {
    conflictedRepo(repo, 7);
    const before = readFileSync(join(repo, GRAPH), 'utf8');
    const r = await resolve(repo);
    expect(r.exitCode).toBe(1);
    expect(r.error).toMatch(/upgrade agentsmesh/i);
    expect(r.error).toContain('version 7');
    expect(readFileSync(join(repo, GRAPH), 'utf8')).toBe(before);
  });
});

describe('lessons resolve — from conflict markers in the file', () => {
  it('rebuilds both sides from the markers when the index has no merge stages', async () => {
    const ours = graph({ a: lesson('Ours A.') }).trimEnd();
    const theirs = graph({ b: lesson('Theirs B.') }).trimEnd();
    writeFile(repo, GRAPH, `<<<<<<< HEAD\n${ours}\n=======\n${theirs}\n>>>>>>> feature\n`);
    const r = await resolve(repo);
    expect(r.exitCode).toBe(0);
    expect(r.data.source).toBe('markers');
    expect(rules(repo)).toEqual(['Ours A.', 'Theirs B.']);
  });

  it('refuses when the markers are malformed', async () => {
    writeFile(repo, GRAPH, '<<<<<<< HEAD\n{}\n=======\n{}\n');
    const r = await resolve(repo);
    expect(r.exitCode).toBe(1);
    expect(r.error).toContain('by hand');
  });
});

describe('lessons resolve — nothing to resolve', () => {
  it('refuses clearly for a clean graph and for a project without lessons', async () => {
    const none = await resolve(repo);
    expect(none.exitCode).toBe(1);
    expect(none.error).toContain('Nothing to resolve');
    writeFile(repo, GRAPH, graph({ a: lesson('A.') }));
    const clean = await resolve(repo);
    expect(clean.exitCode).toBe(1);
    expect(clean.error).toContain('not in a merge conflict');
  });
});
