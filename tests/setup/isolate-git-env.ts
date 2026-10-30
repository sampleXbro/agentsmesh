import { REPO_LOCAL_GIT_ENV } from '../../src/config/remote/repo-local-git-env.js';

/**
 * The pre-commit hook runs this suite with git's GIT_DIR and GIT_INDEX_FILE
 * set. Every test git call, and every CLI a test spawns, inherits
 * process.env, so drop them once here instead of at each call site.
 */
export function isolateGitEnv(): void {
  for (const key of REPO_LOCAL_GIT_ENV) delete process.env[key];
}

isolateGitEnv();
