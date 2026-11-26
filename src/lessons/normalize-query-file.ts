import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';

/**
 * Normalize a recall `--file` path to the project-relative, forward-slash form
 * that lesson `file_glob` patterns are authored against.
 *
 * Recall callers routinely pass shapes a project-relative glob will NOT match:
 * an absolute path (the agent harness often has only that), a `./`-prefixed
 * path, or a Windows backslash path. Without normalization picomatch silently
 * returns no match, so mandatory recall yields zero lessons — a false negative
 * on the most-used recall input. Globs are always project-relative, so the
 * correct, lossless fix is to relativize the input against the project root.
 *
 * A path outside the project root is returned as a `../`-prefixed relative path
 * (still forward-slashed); project globs legitimately will not match it.
 *
 * Pass `cwd` when the path was typed in a shell: from a folder below the root,
 * a relative path is then read from that folder (see {@link anchorRelative}).
 */
export function normalizeRecallFile(file: string, projectRoot: string, cwd?: string): string {
  const typed = file.replaceAll('\\', '/');
  const forward = cwd === undefined ? typed : anchorRelative(typed, projectRoot, cwd);
  const direct = relativize(projectRoot, forward);
  // A `..`-escaping result is EITHER a genuine outside-the-root path OR a
  // symlink mismatch: the CLI derives projectRoot from process.cwd() (the
  // PHYSICAL path, e.g. /private/tmp/x) while a harness passes a LOGICAL
  // absolute path through a symlink (/tmp/x, macOS /tmp -> /private/tmp).
  // Realpath both sides and retry before concluding the file is outside the
  // project; prefer the caller-shaped result so the common path skips all I/O.
  if (!direct.startsWith('../')) return direct;
  const viaReal = relativize(
    safeRealpath(projectRoot),
    safeRealpath(resolve(projectRoot, forward)),
  );
  return viaReal.startsWith('../') ? direct : viaReal;
}

/**
 * Pick the base of a relative path typed in `cwd`, a folder below the project
 * root. An existing path wins: project-relative first (older callers pass that),
 * then cwd-relative. For a file not created yet, a folder that exists only
 * project-relative keeps the project reading; any other case reads like a shell.
 * Returns the path unchanged (project-relative) or resolved against `cwd`.
 */
function anchorRelative(typed: string, projectRoot: string, cwd: string): string {
  if (isAbsolute(typed) || !isBelow(projectRoot, cwd)) return typed;
  const fromRoot = resolve(projectRoot, typed);
  const fromCwd = resolve(cwd, typed);
  if (existsSync(fromRoot)) return typed;
  if (existsSync(fromCwd)) return fromCwd;
  const onlyRootFolder = existsSync(dirname(fromRoot)) && !existsSync(dirname(fromCwd));
  return onlyRootFolder ? typed : fromCwd;
}

/** True when `dir` is a folder strictly inside `root` (symlinks resolved when needed). */
function isBelow(root: string, dir: string): boolean {
  const inside = (r: string, d: string): boolean => {
    const rel = relative(r, d);
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
  };
  return inside(root, dir) || inside(safeRealpath(root), safeRealpath(dir));
}

/** Relativize `forward` against `root`, forward-slashed; the root path itself
 * yields '' from `relative`, so fall back to the input rather than emit ''. */
function relativize(root: string, forward: string): string {
  const rel = relative(root, resolve(root, forward)).replaceAll('\\', '/');
  return rel === '' ? forward.replaceAll('\\', '/') : rel;
}

/**
 * Resolve symlinks on the longest EXISTING prefix of `path`, re-attaching any
 * not-yet-existing tail. Plain `realpathSync` throws on a path whose final
 * segments do not exist yet (a capture target about to be written), so walk up
 * to the nearest real ancestor and rejoin the remainder.
 */
function safeRealpath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    const parent = dirname(path);
    if (parent === path) return path; // reached the filesystem root unresolved
    return resolve(safeRealpath(parent), basename(path));
  }
}
