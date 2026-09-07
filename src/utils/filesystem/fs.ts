/**
 * File system helpers for agentsmesh: atomic write/read/exists/mkdirp.
 * Traversal helpers live in `fs-traverse.ts`; text-encoding helpers in
 * `fs-text-encoding.ts`. Re-exports keep the public API stable.
 */

import {
  readFile,
  open,
  access,
  mkdir,
  rename,
  rm,
  lstat,
  type FileHandle,
} from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { constants } from 'node:fs';
import { FileSystemError } from '../../core/errors.js';
import {
  UTF8_BOM,
  executableModeFor,
  normalizeLineEndings,
  shouldNormalizeLineEndings,
} from './fs-text-encoding.js';

export {
  copyDir,
  ensureCacheSymlink,
  readDirRecursive,
  readDirRecursiveNoSymlinks,
} from './fs-traverse.js';
export { executableModeFor } from './fs-text-encoding.js';
export { renameWithRetry, type RenameRetryOptions } from './rename-retry.js';

interface ErrnoLike {
  code?: string;
  message: string;
}

/**
 * Read file as utf-8 string. Strips BOM. Returns null on ENOENT.
 * @param path - Absolute or relative file path
 * @returns File content or null if not found
 */
export async function readFileSafe(path: string): Promise<string | null> {
  try {
    const data = await readFile(path, 'utf-8');
    return data.startsWith(UTF8_BOM) ? data.slice(UTF8_BOM.length) : data;
  } catch (err) {
    const e = err as ErrnoLike;
    if (e.code === 'ENOENT') return null;
    throw new FileSystemError(
      path,
      `Failed to read ${path}: ${e.message}. Ensure the file exists and is readable.`,
      { cause: err, errnoCode: e.code },
    );
  }
}

/**
 * Write content atomically (write to .tmp, then rename).
 * Creates parent directories.
 *
 * Uses an exclusively created temporary file; rename replaces a destination symlink.
 *
 * @param path - Target file path
 * @param content - Content to write
 * @param options - Optional `mode` (POSIX permission bits). When omitted, the
 *   mode is inferred from the path extension via `executableModeFor`; passing
 *   an explicit value overrides that inference.
 */
export async function writeFileAtomic(
  path: string,
  content: string,
  options?: { mode?: number },
): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  try {
    const info = await lstat(path);
    if (info.isDirectory()) {
      throw new FileSystemError(
        path,
        `Failed to write ${path}: target exists and is a directory. Remove it or choose a different path.`,
        { errnoCode: 'EISDIR' },
      );
    }
  } catch (err) {
    if (err instanceof FileSystemError) throw err;
    const e = err as ErrnoLike;
    if (e.code !== 'ENOENT') throw err;
  }
  const tmpPath = `${path}.tmp-${randomUUID()}`;
  const payload = shouldNormalizeLineEndings(path) ? normalizeLineEndings(content) : content;
  const mode = options?.mode ?? executableModeFor(path);
  let handle: FileHandle | undefined;
  let ownsTemporaryFile = false;
  try {
    handle = await open(tmpPath, 'wx', mode);
    ownsTemporaryFile = true;
    await handle.writeFile(payload, 'utf-8');
    if (mode !== undefined) await handle.chmod(mode);
    await handle.close();
    handle = undefined;
    await rename(tmpPath, path);
  } catch (err) {
    await handle?.close().catch(() => {});
    if (ownsTemporaryFile) await rm(tmpPath, { force: true }).catch(() => {});
    const e = err as ErrnoLike;
    throw new FileSystemError(
      path,
      `Failed to write ${path}: ${e.message}. Check permissions and disk space.`,
      { cause: err, errnoCode: e.code },
    );
  }
}

/** Check if path exists. */
export async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** Create directory recursively. No-op if already exists. */
export async function mkdirp(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}
