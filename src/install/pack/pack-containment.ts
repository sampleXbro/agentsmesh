import { dirname, join } from 'node:path';
import { assertPathInsideRoot } from '../../utils/filesystem/path-containment.js';

/**
 * A pack path must resolve inside the project (the home folder in global
 * mode). git keeps symlinks, so a cloned repo can point `.agentsmesh/packs`, or
 * one pack folder, anywhere; writing or deleting through it reaches outside.
 * `canonicalDir` is always `<root>/.agentsmesh` (config/core/scope.ts). The
 * boundary is that root, not `.agentsmesh`, so a linked `.agentsmesh` fails too.
 */
export function assertPackPathInsideProject(canonicalDir: string, packPath: string): Promise<void> {
  return assertPathInsideRoot(dirname(canonicalDir), packPath);
}

/**
 * Uninstall pre-flight, before any prompt or delete and under --dry-run too
 * (like generate's boundary check): the packs folder and each pack it removes.
 */
export async function assertUninstallPacksInsideProject(
  canonicalDir: string,
  packDirs: readonly (string | null)[],
): Promise<void> {
  await assertPackPathInsideProject(canonicalDir, join(canonicalDir, 'packs'));
  for (const dir of packDirs) {
    if (dir !== null) await assertPackPathInsideProject(canonicalDir, dir);
  }
}
