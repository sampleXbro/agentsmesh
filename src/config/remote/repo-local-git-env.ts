/**
 * Vars that pin git to one repo: `git rev-parse --local-env-vars` minus the
 * GIT_CONFIG* ones, which carry config the caller chose. Git exports several
 * to hooks (a linked worktree gets an absolute GIT_DIR and GIT_INDEX_FILE), so
 * a git process inheriting them works on the caller's repo, not its own.
 * Kept free of imports: the test setup loads it before any vi.mock.
 */
export const REPO_LOCAL_GIT_ENV = [
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_DIR',
  'GIT_GRAFT_FILE',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_INTERNAL_SUPER_PREFIX',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_OBJECT_DIRECTORY',
  'GIT_PREFIX',
  'GIT_REPLACE_REF_BASE',
  'GIT_SHALLOW_FILE',
  'GIT_WORK_TREE',
] as const;
