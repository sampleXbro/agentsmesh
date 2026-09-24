import { lstatSync, realpathSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';

/** Resolve existing ancestors; a missing leaf is safe only for rename-based writes. */
export async function canonicalizePath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const parent = dirname(path);
    if (parent === path) return resolve(path);
    return join(await canonicalizePath(parent), basename(path));
  }
}

/**
 * Sync `canonicalizePath` for code that must stay sync. Unlike the async one it
 * returns null for a dangling link: its missing target must not count as inside.
 */
function canonicalizePathSync(path: string): string | null {
  try {
    return realpathSync(path);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return null;
  }
  try {
    lstatSync(path);
    return null; // The entry exists but does not resolve: a dangling link.
  } catch {
    const parent = dirname(path);
    if (parent === path) return resolve(path);
    const realParent = canonicalizePathSync(parent);
    return realParent === null ? null : join(realParent, basename(path));
  }
}

/** Sync containment test: false when `target` resolves outside `root` or cannot be resolved. */
export function resolvesInsideRootSync(root: string, target: string): boolean {
  const realRoot = canonicalizePathSync(resolve(root));
  const realTarget = canonicalizePathSync(resolve(target));
  return realRoot !== null && realTarget !== null && isPathInside(realTarget, realRoot);
}

export function isPathInside(target: string, root: string): boolean {
  return target === root || target.startsWith(root.endsWith(sep) ? root : `${root}${sep}`);
}

const display = (path: string): string => path.replaceAll('\\', '/');

/**
 * The error names where the path resolves to and the boundary it escapes, so a
 * user can see which symlink is responsible without rerunning under --verbose.
 */
export async function assertPathInsideRoot(root: string, target: string): Promise<void> {
  const rootAbs = resolve(root);
  const targetAbs = resolve(target);
  if (!isPathInside(targetAbs, rootAbs)) {
    throw new Error(`Unsafe filesystem path: ${display(target)} is outside ${display(rootAbs)}`);
  }
  let realTarget: string;
  let realRoot: string;
  try {
    [realTarget, realRoot] = await Promise.all([
      canonicalizePath(targetAbs),
      canonicalizePath(rootAbs),
    ]);
  } catch (cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `Unsafe filesystem path: ${display(target)} could not be resolved (${detail})`,
      { cause },
    );
  }
  if (isPathInside(realTarget, realRoot)) return;
  throw new Error(
    `Unsafe filesystem path: ${display(target)} resolves to ${display(realTarget)} outside ${display(realRoot)}`,
  );
}
