import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { commitAll, git, initRepo, writeFile } from './temp-git-repo.js';

export interface HookRepo {
  /** The linked worktree's gitdir, which git exports to its hooks as GIT_DIR. */
  readonly gitDir: string;
  /** Files no outside git call may change: shared config, both HEADs, the hook's index. */
  snapshot(): Record<string, string>;
}

/**
 * A repo committed from a linked worktree, like `.claude/worktrees/<name>`:
 * the case where git exports an absolute GIT_DIR to the pre-commit hook.
 */
export function createHookRepo(root: string): HookRepo {
  const main = join(root, 'hook-repo');
  const worktree = join(root, 'hook-repo-wt');
  mkdirSync(main, { recursive: true });
  initRepo(main);
  writeFile(main, 'staged.txt');
  commitAll(main, 'hook repo');
  git(main, ['worktree', 'add', '--quiet', '-b', 'wt', worktree]);
  const gitDir = git(worktree, ['rev-parse', '--absolute-git-dir']).trim();
  return {
    gitDir,
    snapshot: () => ({
      config: readFileSync(join(main, '.git', 'config'), 'utf8'),
      mainHead: readFileSync(join(main, '.git', 'HEAD'), 'utf8'),
      head: readFileSync(join(gitDir, 'HEAD'), 'utf8'),
      index: readFileSync(join(gitDir, 'index')).toString('base64'),
    }),
  };
}

/** Set the repo vars git exports to a pre-commit hook run in that worktree. */
export function enterHook(repo: HookRepo): void {
  process.env.GIT_DIR = repo.gitDir;
  process.env.GIT_INDEX_FILE = join(repo.gitDir, 'index');
  process.env.GIT_PREFIX = '';
}
