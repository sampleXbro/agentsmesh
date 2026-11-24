/**
 * Load whole-file templates from `.agentsmesh/files/` (or a pack `files/` tree).
 */

import { relative } from 'node:path';
import { lstat } from 'node:fs/promises';
import type { CanonicalCopiedFile } from './types.js';
import { assertSafeCopiedFilePath } from './paths.js';
import { exists, readFileSafe } from '../../../utils/filesystem/fs.js';
import { readDirRecursiveNoSymlinks } from '../../../utils/filesystem/fs-traverse.js';

const OWNER_EXECUTE = 0o100;

async function ownerExecutableMode(absPath: string): Promise<number | undefined> {
  try {
    const info = await lstat(absPath);
    if ((info.mode & OWNER_EXECUTE) !== 0) return 0o755;
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Parse every regular file under `filesDir` into project-root-relative copies.
 * Missing directory → empty list. Symlinks are skipped by the walker.
 */
export async function parseCopiedFiles(filesDir: string): Promise<CanonicalCopiedFile[]> {
  if (!(await exists(filesDir))) return [];
  const absFiles = await readDirRecursiveNoSymlinks(filesDir);
  const out: CanonicalCopiedFile[] = [];
  for (const abs of absFiles) {
    const rel = assertSafeCopiedFilePath(relative(filesDir, abs).replaceAll('\\', '/'));
    const content = await readFileSafe(abs);
    if (content === null) continue;
    const mode = await ownerExecutableMode(abs);
    out.push(mode === undefined ? { path: rel, content } : { path: rel, content, mode });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}
