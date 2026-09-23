/**
 * A merge driver git cannot start leaves lessons.json as this branch's version,
 * with no conflict markers, while git still holds it unmerged. The file parses,
 * so only git knows; `git add` would then drop the other branch's lessons.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { lessonsGraphProblem } from '../../../src/lessons/graph-problem.js';
import { resolveLessonsConflict } from '../../../src/lessons/resolve-conflict.js';
import { lesson } from '../../helpers/lessons-graph-fixture.js';
import {
  driverDidNotRun,
  graphText,
  isolateGit,
  LESSONS_GRAPH,
  mergeLessonsBranches,
  TWO_CAPTURES,
} from '../../helpers/lessons-merge-repo.js';
import { writeFile } from '../../helpers/temp-git-repo.js';

let repo: string;
let restoreEnv: () => void;
beforeAll(() => {
  restoreEnv = isolateGit();
});
afterAll(() => restoreEnv());
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'am-graph-unmerged-'));
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

function expectUnmergedConflict(project: string): void {
  const problem = lessonsGraphProblem(project);
  expect(problem?.kind).toBe('conflict');
  expect(problem?.message).toBe(
    `git still has ${LESSONS_GRAPH} in a merge conflict, and the file does not hold the lessons ` +
      'from both branches (the lessons merge driver may not have run). Run ' +
      `\`agentsmesh lessons resolve\` BEFORE \`git add ${LESSONS_GRAPH}\`, or the other ` +
      "branch's lessons are dropped.",
  );
}

describe('lessonsGraphProblem — git still holds lessons.json unmerged', () => {
  it('reports a conflict when the file kept only this branch (the driver did not run)', () => {
    expect(mergeLessonsBranches(repo, repo, TWO_CAPTURES)).not.toBe(0);
    driverDidNotRun(repo, repo);
    expectUnmergedConflict(repo);
  });

  it('finds it for a project in a subdirectory of the repository', () => {
    const project = join(repo, 'packages', 'app');
    expect(mergeLessonsBranches(repo, project, TWO_CAPTURES)).not.toBe(0);
    driverDidNotRun(repo, project);
    expectUnmergedConflict(project);
  });

  it('still reports it after a lesson was captured on top of the one-sided file', () => {
    mergeLessonsBranches(repo, repo, TWO_CAPTURES);
    driverDidNotRun(repo, repo);
    const extra = { a: lesson('Ours A.'), c: lesson('New C.'), l0: lesson('Base.') };
    writeFile(repo, LESSONS_GRAPH, graphText(extra));
    expectUnmergedConflict(repo);
  });

  it('is clear once `lessons resolve` combined both sides, even before `git add`', async () => {
    mergeLessonsBranches(repo, repo, TWO_CAPTURES);
    driverDidNotRun(repo, repo);
    expect((await resolveLessonsConflict(repo)).ok).toBe(true);
    expect(lessonsGraphProblem(repo)).toBeNull();
  });

  it('stays clear when a lesson is captured after resolving', async () => {
    mergeLessonsBranches(repo, repo, TWO_CAPTURES);
    driverDidNotRun(repo, repo);
    await resolveLessonsConflict(repo);
    const all = {
      a: lesson('Ours A.'),
      b: lesson('Theirs B.'),
      c: lesson('New C.'),
      l0: lesson('Base.'),
    };
    writeFile(repo, LESSONS_GRAPH, graphText(all));
    expect(lessonsGraphProblem(repo)).toBeNull();
  });

  it('reports a one-sided file when the incoming side cannot be read', () => {
    const broken = TWO_CAPTURES.theirs.replace('"version": 2\n', '"version": 2,\n');
    mergeLessonsBranches(repo, repo, { ...TWO_CAPTURES, theirs: broken });
    driverDidNotRun(repo, repo);
    expectUnmergedConflict(repo);
    // Fixed by hand into one graph: nothing proves a side is missing any more.
    const both = { a: lesson('Ours A.'), b: lesson('Theirs B.'), l0: lesson('Base.') };
    writeFile(repo, LESSONS_GRAPH, graphText(both));
    expect(lessonsGraphProblem(repo)).toBeNull();
  });

  it('is null outside a git repository', () => {
    writeFile(repo, LESSONS_GRAPH, TWO_CAPTURES.ours);
    expect(lessonsGraphProblem(repo)).toBeNull();
  });
});
