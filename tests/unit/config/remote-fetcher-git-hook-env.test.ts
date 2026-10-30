import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { REPO_LOCAL_GIT_ENV } from '../../../src/config/remote/git-env.js';
import { fetchRemoteExtend } from '../../../src/config/remote/remote-fetcher.js';
import { createHookRepo, enterHook } from '../../helpers/git-hook-repo.js';
import { clearEnv, commitAll, git, initRepo, writeFile } from '../../helpers/temp-git-repo.js';

let root: string;
let restoreEnv: () => void;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-remote-fetch-hook-'));
  restoreEnv = clearEnv([...REPO_LOCAL_GIT_ENV, 'AGENTSMESH_ALLOW_LOCAL_GIT']);
  process.env.AGENTSMESH_ALLOW_LOCAL_GIT = '1';
});

afterEach(() => {
  restoreEnv();
  rmSync(root, { recursive: true, force: true });
});

// A user's hook (pre-commit, post-merge) may run `agentsmesh generate` or
// `install` with git's GIT_DIR/GIT_INDEX_FILE set. The cache clone is never
// that repo: an inherited GIT_INDEX_FILE let the clone overwrite the user's
// index, and `checkout`/`rev-parse` in the cache ran against the user's repo.
// retry: a fresh clone is briefly invisible to the next git on Windows CI.
describe('fetchRemoteExtend inside a git hook', { retry: 2 }, () => {
  it.each([
    ['a tag ref', '#v1'],
    ['the default branch', ''],
  ])('fetches %s from the remote and leaves the hook repo alone', async (_label, suffix) => {
    const remote = join(root, 'remote');
    mkdirSync(remote);
    initRepo(remote);
    writeFile(remote, '.agentsmesh/rules/_root.md', '---\nroot: true\n---\n# Remote\n');
    commitAll(remote, 'v1');
    git(remote, ['tag', 'v1']);
    const remoteSha = git(remote, ['rev-parse', 'HEAD']).trim();
    const hook = createHookRepo(root);
    const before = hook.snapshot();
    enterHook(hook);

    const result = await fetchRemoteExtend(`git+file://${remote}${suffix}`, 'hook-extend', {
      cacheDir: join(root, 'cache'),
    });

    expect(result.version).toBe(remoteSha);
    expect(hook.snapshot()).toEqual(before);
  });
});
