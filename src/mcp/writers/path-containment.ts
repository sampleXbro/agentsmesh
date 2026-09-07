import { resolve } from 'node:path';
import { McpError } from '../errors.js';
import {
  canonicalizePath as canonicalize,
  isPathInside as isInside,
} from '../../utils/filesystem/path-containment.js';

/**
 * Resolve a path to its canonical (symlink-free) form. When the leaf does not
 * yet exist (`ENOENT` — the normal case for a not-yet-created write target),
 * canonicalize the existing ancestors and re-append the missing tail. Any OTHER
 * resolution failure (`ELOOP`, `EACCES`, `ENOTDIR`, …) is treated as
 * unresolvable and re-thrown, so containment fails CLOSED rather than
 * optimistically reconstructing a path with a symlink component left unresolved.
 *
 * Caveat: a *dangling* symlink leaf (a link whose target does not exist) also
 * surfaces as `ENOENT` and is reconstructed as if it were an in-root file.
 * Writers must therefore create via a temp file + `rename` (which replaces the
 * link) rather than `writeFile` on the target directly (which would follow the
 * dangling link and escape). All current callers (safeWrite / safeConfigWrite /
 * the `atomicWrite` helpers) are rename-based.
 */
export async function assertContainedPath(opts: {
  root: string;
  target: string;
  boundaryRoot?: string;
  message: string;
}): Promise<void> {
  let root: string;
  let target: string;
  let boundary: string | undefined;
  try {
    root = await canonicalize(resolve(opts.root));
    target = await canonicalize(resolve(opts.target));
    if (opts.boundaryRoot !== undefined) {
      boundary = await canonicalize(resolve(opts.boundaryRoot));
    }
  } catch {
    // A path component could not be resolved (symlink loop, permission error,
    // non-directory ancestor, …) — deny rather than guess.
    throw new McpError('PATH_TRAVERSAL', opts.message);
  }
  if (boundary !== undefined && !isInside(root, boundary)) {
    throw new McpError('PATH_TRAVERSAL', opts.message);
  }
  if (isInside(target, root)) return;
  throw new McpError('PATH_TRAVERSAL', opts.message);
}
