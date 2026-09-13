/**
 * Every directory a generate run may touch for its active targets: the managed
 * output directories plus the parents of the static and superseded files the
 * stale sweep can evict.
 *
 * Checked against the root boundary BEFORE any write. The stale sweep asserts
 * the same paths, but it runs after the outputs are on disk and before the lock
 * is written, so a managed directory that produced no output this run and
 * resolves outside the root would otherwise fail the run half-way: files
 * written, no lock, `check` reporting "not initialized" on every rerun.
 */

import { dirname, join } from 'node:path';
import { assertPathInsideRoot } from '../../utils/filesystem/path-containment.js';
import { getTargetManagedOutputs } from '../../targets/catalog/builtin-targets.js';
import type { TargetLayoutScope } from '../../targets/catalog/target-descriptor.js';

/** Managed dirs belonging to targets this run skipped; left untouched. */
export function retainedDirs(
  inactiveTargets: readonly string[],
  scope: TargetLayoutScope,
): ReadonlySet<string> {
  const dirs = new Set<string>();
  for (const target of inactiveTargets) {
    for (const dir of getTargetManagedOutputs(target, scope)?.dirs ?? []) dirs.add(dir);
  }
  return dirs;
}

export function managedOutputDirs(
  targets: readonly string[],
  scope: TargetLayoutScope,
  inactiveTargets: readonly string[],
): string[] {
  const retained = retainedDirs(inactiveTargets, scope);
  const dirs = new Set<string>();
  for (const target of targets) {
    const managed = getTargetManagedOutputs(target, scope);
    if (!managed) continue;
    for (const dir of managed.dirs) if (!retained.has(dir)) dirs.add(dir);
    for (const file of [...managed.files, ...(managed.supersededFiles ?? [])]) {
      const parent = dirname(file);
      if (parent !== '.') dirs.add(parent);
    }
  }
  return [...dirs].sort();
}

export interface OutputBoundaryArgs {
  projectRoot: string;
  targets: readonly string[];
  scope: TargetLayoutScope;
  inactiveTargets?: readonly string[];
}

/** Rejects, before any write, a managed directory that resolves outside the root. */
export async function assertManagedOutputsInsideRoot(args: OutputBoundaryArgs): Promise<void> {
  await Promise.all(
    managedOutputDirs(args.targets, args.scope, args.inactiveTargets ?? []).map((dir) =>
      assertPathInsideRoot(args.projectRoot, join(args.projectRoot, dir)),
    ),
  );
}
