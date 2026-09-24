/**
 * Pure lock-vs-current drift detection used by `agentsmesh check` and the
 * public Programmatic API. The CLI command formats and exits; this helper
 * returns a structured report.
 */

import { join } from 'node:path';
import {
  buildChecksums,
  buildExtendChecksums,
  detectLockedFeatureViolations,
  readLock,
} from '../../config/core/lock.js';
import { resolveExtendPaths } from '../../config/resolve/resolver.js';
import { diffOutputChecksums } from '../../config/core/lock-outputs.js';
import {
  findStaleGeneratedOutputs,
  findUntrackedManagedDirFiles,
} from '../generate/stale-cleanup.js';
import { hasConflictMarkers } from '../../lessons/conflict-markers.js';
import { readFileSafe } from '../../utils/filesystem/fs.js';
import type { CheckLockSyncOptions, LockSyncReport } from './lock-sync-types.js';

export type { CheckLockSyncOptions, LockSyncReport } from './lock-sync-types.js';

/**
 * Compare the lock file at `canonicalDir/.lock` against the current canonical
 * state and resolved extends. Pure: no logging, no exit codes.
 *
 * Returns `hasLock: false` and `inSync: false` when no readable lock is present
 * (`lockConflict` tells a conflicted lock from a missing one) — callers decide
 * whether that's a hard error (CI) or just informational.
 */
export async function checkLockSync(opts: CheckLockSyncOptions): Promise<LockSyncReport> {
  const { config, configDir, canonicalDir, rootBase, scope = 'project' } = opts;

  const lock = await readLock(canonicalDir);
  if (lock === null) {
    // A lock git left conflicted cannot be read, but it is not a missing one.
    const text = await readFileSafe(join(canonicalDir, '.lock'));
    return {
      inSync: false,
      hasLock: false,
      lockConflict: text !== null && hasConflictMarkers(text),
      canonicalDrift: false,
      outputDrift: false,
      modified: [],
      added: [],
      removed: [],
      extendsModified: [],
      lockedViolations: [],
      outputsModified: [],
      outputsRemoved: [],
      outputsStale: [],
      outputsUntracked: [],
      outputsChecked: false,
    };
  }

  const current = await buildChecksums(canonicalDir);
  const resolvedExtends = await resolveExtendPaths(config, configDir);
  const currentExtends =
    resolvedExtends.length > 0 ? await buildExtendChecksums(resolvedExtends) : {};

  const lockPaths = new Set(Object.keys(lock.checksums));
  const currentPaths = new Set(Object.keys(current));

  const modified: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];

  for (const path of lockPaths) {
    const c = current[path];
    if (c === undefined) {
      removed.push(path);
    } else if (c !== lock.checksums[path]) {
      modified.push(path);
    }
  }
  for (const path of currentPaths) {
    if (!lockPaths.has(path)) {
      added.push(path);
    }
  }

  const extendNames = new Set([...Object.keys(lock.extends), ...Object.keys(currentExtends)]);
  const extendsModified: string[] = [];
  for (const name of extendNames) {
    if (currentExtends[name] !== lock.extends[name]) {
      extendsModified.push(name);
    }
  }

  const lockedViolations = detectLockedFeatureViolations(
    lock.checksums,
    current,
    config.collaboration?.lock_features ?? [],
  );

  // Output verification runs only when a rootBase is supplied AND the lock
  // carries an outputs map (old-format locks leave `lock.outputs` undefined).
  const outputsChecked = rootBase !== undefined && lock.outputs !== undefined;
  const { outputsModified, outputsRemoved } = outputsChecked
    ? await diffOutputChecksums(rootBase, lock.outputs ?? {})
    : { outputsModified: [], outputsRemoved: [] };

  // `generatedOutputs` is the same map as `expectedPaths` here, and that is the
  // point: a file discovered under a managed DIRECTORY is only a generated
  // output if the lock says agentsmesh wrote it. Without this gate the sweep
  // reports the tool's own files — a hook Kiro wrote into `.kiro/hooks` — as
  // stale generated output, and neither remedy the CLI prints can clear it.
  // Static `managedOutputs.files` entries stay ungated, so a genuinely stale
  // owned artifact is still caught.
  const outputsStale =
    rootBase !== undefined && lock.outputs !== undefined
      ? await findStaleGeneratedOutputs({
          projectRoot: rootBase,
          targets: [...config.targets, ...(config.pluginTargets ?? [])],
          expectedPaths: Object.keys(lock.outputs),
          generatedOutputs: Object.keys(lock.outputs),
          scope,
        })
      : [];

  const outputsUntracked =
    rootBase !== undefined && lock.outputs !== undefined
      ? await findUntrackedManagedDirFiles({
          projectRoot: rootBase,
          targets: [...config.targets, ...(config.pluginTargets ?? [])],
          expectedPaths: Object.keys(lock.outputs),
          generatedOutputs: Object.keys(lock.outputs),
          scope,
        })
      : [];

  const canonicalDrift =
    modified.length > 0 || added.length > 0 || removed.length > 0 || extendsModified.length > 0;
  const outputDrift =
    outputsModified.length > 0 || outputsRemoved.length > 0 || outputsStale.length > 0;
  const inSync = !canonicalDrift && !outputDrift;

  return {
    inSync,
    hasLock: true,
    lockConflict: false,
    canonicalDrift,
    outputDrift,
    modified,
    added,
    removed,
    extendsModified,
    lockedViolations,
    outputsModified,
    outputsRemoved,
    outputsStale,
    outputsUntracked,
    outputsChecked,
  };
}
