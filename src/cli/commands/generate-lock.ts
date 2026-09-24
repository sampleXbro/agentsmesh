/**
 * Lock-file writing helper for the generate command.
 */

import { join } from 'node:path';
import {
  buildChecksums,
  buildExtendChecksums,
  buildPackChecksums,
  readLock,
  writeLock,
} from '../../config/core/lock.js';
import { getCacheDir } from '../../config/remote/remote-fetcher.js';
import { ensureCacheSymlink } from '../../utils/filesystem/fs.js';
import { logger } from '../../utils/output/logger.js';
import { getVersion } from '../version.js';
import type { ResolvedExtend } from '../../config/resolve/resolver.js';
import type { LockFile } from '../../core/types.js';

type LockContent = Pick<LockFile, 'checksums' | 'extends' | 'packs' | 'outputs'>;

function sameMap(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): boolean {
  if (a === undefined || b === undefined) return a === b;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

function sameContent(previous: LockFile, next: LockContent): boolean {
  return (
    sameMap(previous.checksums, next.checksums) &&
    sameMap(previous.extends, next.extends) &&
    sameMap(previous.packs, next.packs) &&
    sameMap(previous.outputs, next.outputs)
  );
}

/** Write `.agentsmesh/.lock` when its content changed; returns whether it did. */
export async function writeLockFile(
  context: { canonicalDir: string; configDir: string },
  resolvedExtends: ResolvedExtend[],
  runOutputs: Record<string, string>,
  filtered: boolean,
): Promise<boolean> {
  const checksums = await buildChecksums(context.canonicalDir);
  const extendChecksums =
    resolvedExtends.length > 0 ? await buildExtendChecksums(resolvedExtends) : {};
  const packChecksums = await buildPackChecksums(join(context.canonicalDir, 'packs'));
  const previous = await readLock(context.canonicalDir);
  // Full generate replaces the outputs map (dropping disabled targets' entries).
  // Filtered generate merges per-path so untouched targets' entries survive; it
  // never prunes stale entries — an accepted limitation until the next full run.
  const outputs = filtered ? { ...(previous?.outputs ?? {}), ...runOutputs } : runOutputs;
  const content = { checksums, extends: extendChecksums, packs: packChecksums, outputs };
  // Time, user and version describe the last run that changed the content.
  // Rewriting them on a no-op run dirtied the git tree after every generate.
  const changed = previous === null || !sameContent(previous, content);
  if (changed) {
    await writeLock(context.canonicalDir, {
      generatedAt: new Date().toISOString(),
      generatedBy: process.env['USER'] ?? process.env['USERNAME'] ?? 'unknown',
      libVersion: getVersion(),
      ...content,
    });
  }
  try {
    await ensureCacheSymlink(getCacheDir(), join(context.configDir, '.agentsmeshcache'));
  } catch (err) {
    logger.warn(
      `Could not create .agentsmeshcache symlink: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return changed;
}
