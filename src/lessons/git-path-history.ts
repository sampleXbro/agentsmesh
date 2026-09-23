import { execFileSync } from 'node:child_process';

/**
 * What git knows about project paths, for `file_glob` liveness. All paths are
 * relative to the project root, forward-slash.
 */
export interface GitPathHistory {
  /** Paths in the index: live even while missing from disk. */
  readonly tracked: ReadonlySet<string>;
  /** Paths a commit reachable from HEAD deleted. */
  readonly deleted: ReadonlySet<string>;
  /** Old side of every rename reachable from HEAD. */
  readonly renamedAway: ReadonlySet<string>;
}

/** Bound per git call. A slower scan reads as unknown, never as dead. */
export const GIT_SCAN_TIMEOUT_MS = 3_000;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

const cache = new Map<string, GitPathHistory | null>();

/** {@link scanGitPathHistory}, run once per project root per process. */
export function readGitPathHistory(projectRoot: string): GitPathHistory | null {
  if (!cache.has(projectRoot)) cache.set(projectRoot, scanGitPathHistory(projectRoot));
  return cache.get(projectRoot) ?? null;
}

// A pathspec would be faster, but it turns a rename out of the pathspec into a
// plain deletion, which loses the rename proof wildcard globs need.
const LOG_ARGS = [
  'log',
  'HEAD',
  '--relative',
  '-M',
  '--diff-filter=DR',
  '--name-status',
  '-z',
  '--no-color',
  '--no-show-signature',
  '--pretty=format:',
];

/**
 * Tracked paths plus the deletions and renames in HEAD's history. `null` means
 * unknown: not a git work tree, no commit yet, or git failed or ran past
 * `timeoutMs`. HEAD only, so a removal on an unmerged branch never counts here.
 * Cost is linear in history: about 0.3 s for 1k commits, 0.55 s for 2.6k.
 */
export function scanGitPathHistory(
  projectRoot: string,
  timeoutMs: number = GIT_SCAN_TIMEOUT_MS,
): GitPathHistory | null {
  const tracked = runGit(projectRoot, ['ls-files', '-z'], timeoutMs);
  if (tracked === null) return null;
  const log = runGit(projectRoot, LOG_ARGS, timeoutMs);
  if (log === null) return null;
  return { tracked: new Set(tracked.split('\0').filter(Boolean)), ...parseRemovals(log) };
}

// `-z` name-status output: a status token, then one path (D) or old + new (R).
function parseRemovals(out: string): Pick<GitPathHistory, 'deleted' | 'renamedAway'> {
  const deleted = new Set<string>();
  const renamedAway = new Set<string>();
  const tokens = out.split('\0');
  for (let i = 0; i < tokens.length; i += 1) {
    const status = tokens[i] ?? '';
    const path = tokens[i + 1] ?? '';
    if (status.startsWith('D')) {
      if (path !== '') deleted.add(path);
      i += 1;
    } else if (status.startsWith('R')) {
      if (path !== '') renamedAway.add(path);
      i += 2;
    }
  }
  return { deleted, renamedAway };
}

function runGit(cwd: string, args: readonly string[], timeoutMs: number): string | null {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: MAX_OUTPUT_BYTES,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
  } catch {
    return null;
  }
}
