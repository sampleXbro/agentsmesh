import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runGit } from './git-exec.js';

/** A git operation that a conflicted lessons.json can be part of. */
export type GitOperation = 'merge' | 'rebase' | 'cherry-pick' | 'revert' | 'none';

/** The operation in progress in the repository of `projectRoot`; null outside git. */
export function gitOperation(projectRoot: string): GitOperation | null {
  const dir = runGit(projectRoot, ['rev-parse', '--git-dir']);
  if (dir.status !== 0) return null;
  const gitDir = resolve(projectRoot, dir.stdout.trim());
  const has = (name: string): boolean => existsSync(join(gitDir, name));
  if (has('rebase-merge') || has('rebase-apply')) return 'rebase';
  if (has('CHERRY_PICK_HEAD')) return 'cherry-pick';
  if (has('REVERT_HEAD')) return 'revert';
  return has('MERGE_HEAD') ? 'merge' : 'none';
}
