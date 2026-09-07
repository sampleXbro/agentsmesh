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

export function isPathInside(target: string, root: string): boolean {
  return target === root || target.startsWith(root.endsWith(sep) ? root : `${root}${sep}`);
}

export async function assertPathInsideRoot(root: string, target: string): Promise<void> {
  const rootAbs = resolve(root);
  const targetAbs = resolve(target);
  try {
    if (
      isPathInside(targetAbs, rootAbs) &&
      isPathInside(await canonicalizePath(targetAbs), await canonicalizePath(rootAbs))
    )
      return;
  } catch (cause: unknown) {
    throw new Error(`Unsafe filesystem path: ${target.replaceAll('\\', '/')}`, { cause });
  }
  throw new Error(`Unsafe filesystem path: ${target.replaceAll('\\', '/')}`);
}
