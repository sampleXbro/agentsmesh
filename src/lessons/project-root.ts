import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export type ProjectRootKind = 'lessons' | 'config' | 'git';

export interface LocatedRoot {
  readonly root: string;
  readonly kind: ProjectRootKind;
}

/**
 * Walks up from `start` and picks the lessons project, in this order:
 * the nearest folder with lessons (`hasLessons`), else the nearest folder with
 * `agentsmesh.yaml`, else the git top level, else null.
 *
 * The walk stops at the first folder with a `.git` entry (a folder, or a file in
 * worktrees and submodules) after checking it, so a nested checkout never reads
 * its parent's lessons. It also stops below the home folder: lessons belong to
 * a repository, and a graph under `~` would apply to every folder beneath it.
 */
export function locateProjectRoot(
  start: string,
  hasLessons: (dir: string) => boolean,
): LocatedRoot | null {
  const stops = homeDirs();
  let config: string | null = null;
  let dir = start;
  let prev = '';
  while (dir !== prev && !stops.has(dir)) {
    if (hasLessons(dir)) return { root: dir, kind: 'lessons' };
    if (config === null && existsSync(join(dir, 'agentsmesh.yaml'))) config = dir;
    if (existsSync(join(dir, '.git'))) {
      return config === null ? { root: dir, kind: 'git' } : { root: config, kind: 'config' };
    }
    prev = dir;
    dir = dirname(dir);
  }
  return config === null ? null : { root: config, kind: 'config' };
}

/** True for the home folder, whose `.agentsmesh` is the global config, never a lessons project. */
export function isHomeDirectory(dir: string): boolean {
  return homeDirs().has(resolve(dir));
}

/** The home directory as given and as resolved: HOME may be a symlink (macOS `/tmp`). */
function homeDirs(): ReadonlySet<string> {
  const home = homedir();
  if (home === '') return new Set();
  const dirs = new Set([resolve(home)]);
  try {
    dirs.add(realpathSync(home));
  } catch {
    // A home that does not exist has no other name.
  }
  return dirs;
}
