/**
 * A merge driver git could not start leaves lessons.json as this branch's file
 * with no markers, so `git add -A && git commit` silently drops the other
 * branch's lessons. The recall hook warns before the staging command runs.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EDIT_ONLY_CAPTURES,
  graphWithTriggers,
  triggered,
} from '../../helpers/lessons-repair-fixture.js';
import { lesson } from '../../helpers/lessons-graph-fixture.js';
import { STAGING_WARNING, useStagingRepo, WARNED } from '../../helpers/lessons-hook-staging.js';
import {
  driverDidNotRun,
  mergeLessonsBranches,
  TWO_CAPTURES,
} from '../../helpers/lessons-merge-repo.js';

const staging = useStagingRepo();

describe('recall hook — staging while lessons.json is still unmerged', () => {
  it.each([
    'git add -A',
    'git add --all',
    'git add .',
    'git add -u',
    'git add .agentsmesh',
    'git add .agentsmesh/lessons/lessons.json',
    'git commit -m "merge"',
    'git commit -am "merge"',
    'git merge --continue',
    'git rebase --continue',
    'git cherry-pick --continue',
    'pnpm test && git add -A && git commit -m x',
    'cd . && git add -A',
  ])('warns before `%s`', async (command) => {
    staging.unmerged();
    expect(JSON.parse(await staging.hook(command))).toEqual(WARNED);
  });

  it('warns every time, not once per session', async () => {
    staging.unmerged();
    const session = 'hook-staging-repeat';
    expect(JSON.parse(await staging.hook('git add -A', { session }))).toEqual(WARNED);
    expect(JSON.parse(await staging.hook('git commit -a -m x', { session }))).toEqual(WARNED);
  });

  it('works for a project in a subdirectory of the repository', async () => {
    const project = join(staging.repo(), 'packages', 'app');
    mkdirSync(project, { recursive: true });
    expect(mergeLessonsBranches(staging.repo(), project, TWO_CAPTURES)).not.toBe(0);
    driverDidNotRun(staging.repo(), project);
    expect(JSON.parse(await staging.hook('git add -A', { cwd: project }))).toEqual(WARNED);
  });

  it('warns when the other branch only edited a lesson this branch also has', async () => {
    staging.unmerged(EDIT_ONLY_CAPTURES);
    expect(JSON.parse(await staging.hook('git commit -am "merge"'))).toEqual(WARNED);
  });

  it('keeps recalling lessons for the command, below the warning', async () => {
    const sides = {
      base: graphWithTriggers({ l0: lesson('Base.') }, {}),
      ours: graphWithTriggers(
        { a: triggered('Ours A.', ['g1']), l0: lesson('Base.') },
        { g1: { kind: 'command_pattern', pattern: 'git commit' } },
      ),
      theirs: graphWithTriggers({ b: lesson('Theirs B.'), l0: lesson('Base.') }, {}),
    };
    const repo = staging.repo();
    expect(mergeLessonsBranches(repo, repo, sides)).not.toBe(0);
    driverDidNotRun(repo, repo);
    const out = JSON.parse(await staging.hook('git commit -m x')) as typeof WARNED;
    const context = out.hookSpecificOutput.additionalContext;
    expect(
      context.startsWith(`${STAGING_WARNING}\n\nRecalled agentsmesh lessons for git commit`),
    ).toBe(true);
    expect(context).toContain('Ours A.');
  });
});
