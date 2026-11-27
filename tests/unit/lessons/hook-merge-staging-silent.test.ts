/**
 * The staging warning is quiet when it does not apply: other commands never
 * spawn git (the hook runs on every tool call), a resolved graph is fine, and
 * a missing or broken git never makes the hook fail.
 */
import { describe, expect, it, vi } from 'vitest';

const probe = vi.hoisted(() => ({ calls: 0, gitMissing: false }));
vi.mock('../../../src/lessons/git-exec.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/lessons/git-exec.js')>();
  return {
    ...actual,
    runGit: (...args: Parameters<typeof actual.runGit>): ReturnType<typeof actual.runGit> => {
      probe.calls += 1;
      return probe.gitMissing ? { status: -1, stdout: '', stderr: '' } : actual.runGit(...args);
    },
  };
});

import { buildRecallHookOutput } from '../../../src/lessons/hook.js';
import { resolveLessonsConflict } from '../../../src/lessons/resolve-conflict.js';
import { lesson } from '../../helpers/lessons-graph-fixture.js';
import { useStagingRepo } from '../../helpers/lessons-hook-staging.js';
import { graphText, LESSONS_GRAPH, TWO_CAPTURES } from '../../helpers/lessons-merge-repo.js';
import { git, writeFile } from '../../helpers/temp-git-repo.js';

const staging = useStagingRepo();

describe('recall hook — commands that cannot stage the graph never spawn git', () => {
  it.each([
    'git status',
    'git diff --stat',
    'git add src/a.ts',
    'git merge feature',
    'git merge --abort',
    'git rebase main',
    'ls -la',
    'pnpm test',
    'echo "git add -A"',
  ])('stays silent for `%s`', async (command) => {
    staging.unmerged();
    probe.calls = 0;
    expect(await staging.hook(command)).toBe('');
    expect(probe.calls).toBe(0);
  });

  it('does not warn on PostToolUse, when the command has already run', async () => {
    staging.unmerged();
    probe.calls = 0;
    expect(await staging.hook('git add -A', { event: 'PostToolUse' })).toBe('');
    expect(probe.calls).toBe(0);
  });
});

describe('recall hook — staging once the graph holds both branches', () => {
  it('stays silent after `lessons resolve`, before and after `git add`', async () => {
    staging.unmerged();
    expect((await resolveLessonsConflict(staging.repo())).ok).toBe(true);
    expect(await staging.hook('git add -A')).toBe('');
    git(staging.repo(), ['add', LESSONS_GRAPH]);
    expect(await staging.hook('git commit -m "merge"')).toBe('');
  });

  it('stays silent when the file was fixed by hand to hold every lesson', async () => {
    staging.unmerged();
    const all = { a: lesson('Ours A.'), b: lesson('Theirs B.'), l0: lesson('Base.') };
    writeFile(staging.repo(), LESSONS_GRAPH, graphText(all));
    expect(await staging.hook('git add -A')).toBe('');
  });

  it('stays silent outside a merge', async () => {
    writeFile(staging.repo(), LESSONS_GRAPH, TWO_CAPTURES.ours);
    git(staging.repo(), ['init', '--quiet', '--initial-branch=main']);
    expect(await staging.hook('git add -A')).toBe('');
  });
});

describe('recall hook — staging check fails open', () => {
  it('stays silent and exits normally outside a git repository', async () => {
    const repo = staging.repo();
    writeFile(repo, LESSONS_GRAPH, TWO_CAPTURES.ours);
    const payload = {
      hook_event_name: 'PreToolUse',
      cwd: repo,
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m x' },
    };
    expect(await buildRecallHookOutput(JSON.stringify(payload), repo)).toEqual({ output: '' });
  });

  it('stays silent when git cannot be started', async () => {
    staging.unmerged();
    probe.gitMissing = true;
    try {
      expect(await staging.hook('git add -A')).toBe('');
    } finally {
      probe.gitMissing = false;
    }
  });
});
