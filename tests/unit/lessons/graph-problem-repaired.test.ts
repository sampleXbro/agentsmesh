/**
 * The merge driver tells users to repair the combined graph (`lessons untrigger`,
 * `lessons prune`) before staging. A repaired lesson differs from the merge
 * result but is not lost, so only a lesson that is missing counts as dropped.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { lessonsGraphProblem } from '../../../src/lessons/graph-problem.js';
import { loadLessonsGraph, saveLessonsGraph } from '../../../src/lessons/graph-store.js';
import { resolveLessonsConflict } from '../../../src/lessons/resolve-conflict.js';
import { untriggerLesson } from '../../../src/lessons/untrigger.js';
import { lesson } from '../../helpers/lessons-graph-fixture.js';
import {
  driverDidNotRun,
  graphText,
  isolateGit,
  LESSONS_GRAPH,
  mergeLessonsBranches,
  TWO_CAPTURES,
} from '../../helpers/lessons-merge-repo.js';
import { TRIGGERED_CAPTURES } from '../../helpers/lessons-repair-fixture.js';
import { writeFile } from '../../helpers/temp-git-repo.js';

let repo: string;
let restoreEnv: () => void;
beforeAll(() => {
  restoreEnv = isolateGit();
});
afterAll(() => restoreEnv());
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'am-graph-repaired-'));
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('lessonsGraphProblem — a combined graph repaired before `git add`', () => {
  it('is clear after `lessons untrigger` changed a lesson of the merge result', async () => {
    expect(mergeLessonsBranches(repo, repo, TRIGGERED_CAPTURES)).not.toBe(0);
    expect((await resolveLessonsConflict(repo)).ok).toBe(true);
    const graph = loadLessonsGraph(repo);
    untriggerLesson(graph, 'a', 'g1');
    saveLessonsGraph(repo, graph);
    expect(loadLessonsGraph(repo).lessons.a?.triggers).toEqual(['g0']);
    expect(lessonsGraphProblem(repo)).toBeNull();
  });

  it('is clear after a lesson was reworded by hand', async () => {
    expect(mergeLessonsBranches(repo, repo, TWO_CAPTURES)).not.toBe(0);
    await resolveLessonsConflict(repo);
    const graph = loadLessonsGraph(repo);
    graph.lessons.b = { ...graph.lessons.b!, rule: 'Theirs B, reworded.' };
    saveLessonsGraph(repo, graph);
    expect(lessonsGraphProblem(repo)).toBeNull();
  });

  it('still reports a missing lesson even when the others were edited', () => {
    mergeLessonsBranches(repo, repo, TWO_CAPTURES);
    driverDidNotRun(repo, repo);
    writeFile(
      repo,
      LESSONS_GRAPH,
      graphText({ a: lesson('Ours A, reworded.'), l0: lesson('Base, reworded.') }),
    );
    expect(lessonsGraphProblem(repo)?.kind).toBe('conflict');
  });
});

describe('lessonsGraphProblem — two branches that minted the same lesson id', () => {
  const COLLISION = {
    base: graphText({ l0: lesson('Base.') }),
    ours: graphText({ l0: lesson('Base.'), x: lesson('Ours rule.') }),
    theirs: graphText({ l0: lesson('Base.'), x: lesson('Theirs rule.') }),
  };

  it('reports the file that kept only this branch (the renamed lesson is missing)', () => {
    mergeLessonsBranches(repo, repo, COLLISION);
    driverDidNotRun(repo, repo);
    expect(lessonsGraphProblem(repo)?.kind).toBe('conflict');
  });

  it('is clear when both lessons are in the file, whichever id each one has', () => {
    mergeLessonsBranches(repo, repo, COLLISION);
    driverDidNotRun(repo, repo);
    writeFile(
      repo,
      LESSONS_GRAPH,
      graphText({ l0: lesson('Base.'), x: lesson('Ours rule.'), 'x-2': lesson('Theirs rule.') }),
    );
    expect(lessonsGraphProblem(repo)).toBeNull();
  });
});
