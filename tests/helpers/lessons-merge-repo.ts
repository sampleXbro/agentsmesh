import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Lesson, LessonsGraph } from '../../src/lessons/graph-schema.js';
import { serializeGraph } from '../../src/lessons/graph-store.js';
import { lesson } from './lessons-graph-fixture.js';
import { clearEnv, commitAll, git, GIT_HOOK_ENV, initRepo, writeFile } from './temp-git-repo.js';

export const LESSONS_GRAPH = '.agentsmesh/lessons/lessons.json';

/** Serialized graph with topic `t` and no triggers. */
export function graphText(lessons: Record<string, Lesson>): string {
  return serializeGraph({
    version: 2,
    lessons,
    topics: { t: { summary: 'T.' } },
    triggers: {},
  } as LessonsGraph);
}

interface MergeSides {
  readonly base: string;
  readonly ours: string;
  readonly theirs: string;
}

/** Base `l0`; this branch adds `a`, the incoming branch adds `b`. */
export const TWO_CAPTURES: MergeSides = {
  base: graphText({ l0: lesson('Base.') }),
  ours: graphText({ a: lesson('Ours A.'), l0: lesson('Base.') }),
  theirs: graphText({ b: lesson('Theirs B.'), l0: lesson('Base.') }),
};

/** Unset hook-exported git vars and ignore host git config; returns the restore function. */
export function isolateGit(): () => void {
  const restore = clearEnv([...GIT_HOOK_ENV, 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM']);
  process.env.GIT_CONFIG_GLOBAL = join(tmpdir(), 'am-lessons-merge-no-global-gitconfig');
  process.env.GIT_CONFIG_NOSYSTEM = '1';
  return restore;
}

/**
 * Commit `base` on main, `theirs` on `feature` and `ours` on main, then merge
 * `feature` with a plain line merge (no merge driver). `project` is the
 * directory holding `.agentsmesh`, inside `repo`. Returns git's exit status.
 */
export function mergeLessonsBranches(repo: string, project: string, sides: MergeSides): number {
  initRepo(repo);
  writeFile(project, LESSONS_GRAPH, sides.base);
  commitAll(repo, 'base');
  git(repo, ['checkout', '-q', '-b', 'feature']);
  writeFile(project, LESSONS_GRAPH, sides.theirs);
  commitAll(repo, 'theirs');
  git(repo, ['checkout', '-q', 'main']);
  writeFile(project, LESSONS_GRAPH, sides.ours);
  commitAll(repo, 'ours');
  const merge = spawnSync('git', ['-c', 'commit.gpgsign=false', 'merge', '--no-edit', 'feature'], {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'T',
      GIT_AUTHOR_EMAIL: 't@e.st',
      GIT_COMMITTER_NAME: 'T',
      GIT_COMMITTER_EMAIL: 't@e.st',
    },
  });
  return merge.status ?? -1;
}

/**
 * What a merge driver git could not start leaves behind: the file is this
 * branch's version with no conflict markers, but git still holds it unmerged.
 */
export function driverDidNotRun(repo: string, project: string): void {
  git(project, ['checkout', '--ours', '--', LESSONS_GRAPH]);
  if (git(repo, ['ls-files', '-u']).trim() === '') throw new Error('expected an unmerged index');
}
