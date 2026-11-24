/**
 * Remove previously copied files that a full generate no longer emits.
 */

import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { assertSafeCopiedFilePath } from './paths.js';
import { assertPathInsideRoot } from '../../../utils/filesystem/path-containment.js';

export interface CleanupVerbatimArgs {
  readonly projectRoot: string;
  /** Paths recorded on the previous lock; omit/empty → nothing to delete. */
  readonly previous: readonly string[] | undefined;
  /** Paths this run emitted. */
  readonly current: readonly string[];
  /** When false (filtered `--targets` run), leave stale paths alone. */
  readonly prune: boolean;
}

/**
 * Delete prior `verbatimOutputs` paths that this run did not re-emit.
 * Only runs when `prune` is true; refuses paths outside the project root.
 */
export async function cleanupStaleVerbatimOutputs(args: CleanupVerbatimArgs): Promise<void> {
  if (!args.prune || !args.previous?.length) return;
  const keep = new Set(args.current.map((p) => p.replaceAll('\\', '/')));
  for (const raw of args.previous) {
    const path = raw.replaceAll('\\', '/');
    if (keep.has(path)) continue;
    assertSafeCopiedFilePath(path);
    const abs = join(args.projectRoot, path);
    await assertPathInsideRoot(args.projectRoot, abs);
    await rm(abs, { force: true });
  }
}

/** Merge previous + current paths for a filtered generate lock write. */
export function mergeVerbatimOutputs(
  previous: readonly string[] | undefined,
  current: readonly string[],
  filtered: boolean,
): string[] | undefined {
  if (!filtered) return current.length > 0 ? [...current].sort() : undefined;
  const merged = [
    ...new Set([...(previous ?? []), ...current].map((p) => p.replaceAll('\\', '/'))),
  ];
  return merged.length > 0 ? merged.sort() : undefined;
}
