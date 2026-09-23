import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { type GitPathHistory, readGitPathHistory } from './git-path-history.js';
import { toRelPath } from './paths.js';

/**
 * Directories never worth walking for the trigger-liveness file list: the huge,
 * non-source ones. Note `dist`/`coverage`/build outputs are deliberately KEPT —
 * a glob over a present-but-gitignored build artifact must read as LIVE.
 */
const SKIP_DIRS = new Set(['.git', 'node_modules']);

/** Safety bound on the walk so a pathological tree can't run away. */
const MAX_FILES = 200_000;

/** On-disk project files plus the git evidence that decides whether a missing glob is dead. */
export interface ProjectFiles extends ReadonlySet<string> {
  /** Read lazily (only when some glob matches nothing on disk); null = no evidence. */
  readonly gitHistory: () => GitPathHistory | null;
}

export function projectFilesOf(
  paths: Iterable<string>,
  gitHistory: () => GitPathHistory | null,
): ProjectFiles {
  return Object.assign(new Set(paths), { gitHistory });
}

/** Git evidence carried by `paths`; null for a plain set, so nothing can be proven dead. */
export function gitHistoryOf(paths: ReadonlySet<string>): GitPathHistory | null {
  return (paths as Partial<ProjectFiles>).gitHistory?.() ?? null;
}

/**
 * The on-disk file list (project-relative, forward-slash) used by the
 * `file_glob` liveness checks, with the project's git evidence attached — or
 * `null` (unknown) when it cannot be read or the walk passes `maxFiles`, so the
 * caller SKIPS the checks instead of judging globs against a partial list.
 *
 * Walks by existence, not git tracking, so a present-but-gitignored file (e.g. a
 * build output) is live. A glob matching nothing here is not dead by itself:
 * see `fileGlobLiveness`. Skips `.git`/`node_modules`. Never throws. Not on the
 * recall hot path (only capture, `validate`/`lint`/`prune` call it).
 */
export function listProjectFiles(
  projectRoot: string,
  maxFiles: number = MAX_FILES,
): ProjectFiles | null {
  const out = new Set<string>();
  try {
    const stack = [projectRoot];
    while (stack.length > 0) {
      const dir = stack.pop()!;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name)) stack.push(join(dir, entry.name));
        } else if (entry.isFile()) {
          out.add(toRelPath(projectRoot, join(dir, entry.name)));
          if (out.size > maxFiles) return null;
        }
      }
    }
  } catch {
    return null;
  }
  return projectFilesOf(out, () => readGitPathHistory(projectRoot));
}
