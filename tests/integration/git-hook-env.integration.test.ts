/**
 * The husky pre-commit hook runs this suite. Committed from a linked worktree,
 * git exports an absolute GIT_DIR and GIT_INDEX_FILE to the hook, and every
 * temp-repo git call that inherited them wrote into the real repo: core.bare,
 * a [user] section and a merge driver landed in the shared .git/config.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { REPO_LOCAL_GIT_ENV } from '../../src/config/remote/git-env.js';
import unitConfig from '../../vitest.config.js';
import e2eConfig from '../../vitest.e2e.config.js';
import { createHookRepo, enterHook, type HookRepo } from '../helpers/git-hook-repo.js';
import { clearEnv, commitAll, git, initRepo, writeFile } from '../helpers/temp-git-repo.js';
import { isolateGitEnv } from '../setup/isolate-git-env.js';
import { createBareRepoWithTwoCommits } from './fixtures/refresh-git-source/setup.js';

let root: string;
let hook: HookRepo;
let restoreEnv: () => void;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-git-hook-env-'));
  restoreEnv = clearEnv(REPO_LOCAL_GIT_ENV);
  hook = createHookRepo(root);
  enterHook(hook);
});

afterEach(() => {
  restoreEnv();
  rmSync(root, { recursive: true, force: true });
});

describe('test-spawned git inside a git hook', () => {
  it('reaches the hook repo while the hook vars are set', () => {
    const dir = join(root, 'probe');
    mkdirSync(dir);
    expect(git(dir, ['rev-parse', '--absolute-git-dir']).trim()).toBe(hook.gitDir);
  });

  it('leaves the hook repo untouched once isolateGitEnv has run', async () => {
    const before = hook.snapshot();
    isolateGitEnv();

    const repo = join(root, 'temp-repo');
    mkdirSync(repo);
    initRepo(repo);
    git(repo, ['config', 'merge.agentsmesh-lessons.driver', 'agentsmesh lessons merge-driver']);
    writeFile(repo, 'a.txt');
    commitAll(repo, 'one');
    const bare = await createBareRepoWithTwoCommits();
    await bare.cleanup();

    expect(git(repo, ['log', '--format=%s']).trim()).toBe('one');
    expect(hook.snapshot()).toEqual(before);
  });

  it('runs isolateGitEnv before every test file in both vitest configs', () => {
    const setupFiles = ['./tests/setup/isolate-git-env.ts'];
    expect(unitConfig.test?.setupFiles).toEqual(setupFiles);
    expect(e2eConfig.test?.setupFiles).toEqual(setupFiles);
  });
});
