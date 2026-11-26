/**
 * The merge driver did not run and the other branch only edited a lesson this
 * branch also has: no lesson id is missing, but the file is still exactly this
 * branch's version, so `git add` would drop the edit. A file repaired after a
 * real union differs from this branch and is left alone.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runLessons } from '../../../src/cli/commands/lessons.js';
import { lessonsGraphProblem } from '../../../src/lessons/graph-problem.js';
import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import {
  graphFilePath,
  loadLessonsGraph,
  saveLessonsGraph,
} from '../../../src/lessons/graph-store.js';
import { resolveLessonsConflict } from '../../../src/lessons/resolve-conflict.js';
import { untriggerLesson } from '../../../src/lessons/untrigger.js';
import {
  driverDidNotRun,
  isolateGit,
  LESSONS_GRAPH,
  mergeLessonsBranches,
} from '../../helpers/lessons-merge-repo.js';
import { EDIT_ONLY_CAPTURES } from '../../helpers/lessons-repair-fixture.js';
import { commitAll, git, initRepo, writeFile } from '../../helpers/temp-git-repo.js';

let repo: string;
let restoreEnv: () => void;
beforeAll(() => {
  restoreEnv = isolateGit();
});
afterAll(() => restoreEnv());
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'am-edit-only-'));
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

const saved = (): LessonsGraph => JSON.parse(readFileSync(graphFilePath(repo), 'utf8'));

function conflictWithoutDriver(): void {
  expect(mergeLessonsBranches(repo, repo, EDIT_ONLY_CAPTURES)).not.toBe(0);
  driverDidNotRun(repo, repo);
}

describe('driver did not run, the other branch only edited a shared lesson', () => {
  it('flags the file that is still this branch, compared as a graph and not as bytes', () => {
    conflictWithoutDriver();
    expect(saved().lessons.l0?.rule).toBe('Base.');
    expect(lessonsGraphProblem(repo)?.kind).toBe('conflict');
    writeFileSync(graphFilePath(repo), JSON.stringify(saved()));
    expect(lessonsGraphProblem(repo)?.kind).toBe('conflict');
  });

  it('makes `lessons validate` fail with MERGE_CONFLICT', async () => {
    conflictWithoutDriver();
    const r = await runLessons({}, ['validate'], repo);
    expect(r.exitCode).toBe(1);
    const codes = r.subcommand === 'validate' ? r.data.findings.map((f) => f.code) : [];
    expect(codes).toEqual(['MERGE_CONFLICT']);
  });

  it('is rewritten to the union by `lessons resolve`, and then clear', async () => {
    conflictWithoutDriver();
    const outcome = await resolveLessonsConflict(repo);
    expect(outcome.ok && outcome.resolved.alreadyResolved).toBeUndefined();
    expect(saved().lessons.l0).toMatchObject({ rule: 'Reworded.', evidence: ['ev1'] });
    expect(lessonsGraphProblem(repo)).toBeNull();
  });
});

describe('a real union that was then repaired', () => {
  it('is not flagged, and `lessons resolve` keeps it', async () => {
    expect(mergeLessonsBranches(repo, repo, EDIT_ONLY_CAPTURES)).not.toBe(0);
    expect((await resolveLessonsConflict(repo)).ok).toBe(true);
    const graph = loadLessonsGraph(repo);
    untriggerLesson(graph, 'l0', 'g1');
    saveLessonsGraph(repo, graph);
    const repaired = readFileSync(graphFilePath(repo), 'utf8');

    expect(lessonsGraphProblem(repo)).toBeNull();
    const again = await resolveLessonsConflict(repo);
    expect(again.ok && again.resolved.alreadyResolved).toBe(true);
    expect(readFileSync(graphFilePath(repo), 'utf8')).toBe(repaired);
  });
});

describe('both branches made the same change', () => {
  /** git would merge this cleanly, so the unmerged index entries are forged. */
  function forgeUnmerged(base: string, ours: string, theirs: string): void {
    initRepo(repo);
    writeFile(repo, LESSONS_GRAPH, base);
    commitAll(repo, 'base');
    const run = (args: string[], input: string): string => {
      const r = spawnSync('git', args, { cwd: repo, input, encoding: 'utf8' });
      expect(r.status, r.stderr).toBe(0);
      return r.stdout.trim();
    };
    const blob = (text: string): string => run(['hash-object', '-w', '--stdin'], text);
    const stage = (n: number, text: string): string =>
      `100644 ${blob(text)} ${n}\t${LESSONS_GRAPH}`;
    const entries = [
      `0 ${'0'.repeat(40)}\t${LESSONS_GRAPH}`,
      stage(1, base),
      stage(2, ours),
      stage(3, theirs),
    ];
    run(['update-index', '--index-info'], `${entries.join('\n')}\n`);
    expect(git(repo, ['ls-files', '-u']).trim().split('\n')).toHaveLength(3);
    writeFile(repo, LESSONS_GRAPH, ours);
  }

  it('does not flag a file equal to this branch when the union equals it too', () => {
    const { base, ours } = EDIT_ONLY_CAPTURES;
    forgeUnmerged(base, ours, ours);
    expect(lessonsGraphProblem(repo)).toBeNull();
  });
});
