/**
 * Outputs of a target the config no longer lists.
 *
 * The stale sweep only walks configured targets, so a removed target's files
 * would stay for ever. The previous lock's `outputs` map is the record of what
 * agentsmesh wrote, so this finds them from there and needs no descriptor: it
 * works the same for a plugin that is no longer registered.
 *
 * A file is deleted only when it still hashes to the lock entry (nobody has
 * edited it). Edited files stay. So do `coOwnedFiles` of any known target: they
 * hold the user's own settings next to ours, and an unchanged hash does not
 * prove the user put nothing in them before agentsmesh first wrote there.
 *
 * Outputs under a configured target's managed paths are left to the stale
 * sweep, which has its own rules for them.
 */

import { lstat, rm, rmdir } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import { hashFileForManifest } from '../../utils/crypto/hash.js';
import { assertPathInsideRoot } from '../../utils/filesystem/path-containment.js';
import { getTargetManagedOutputs } from '../../targets/catalog/builtin-targets.js';
import { managedOutputFiles } from '../../targets/catalog/managed-outputs.js';
import { getAllRegisteredDescriptorIds } from '../../targets/catalog/registry.js';
import type { TargetLayoutScope } from '../../targets/catalog/target-descriptor.js';

export interface KeptOutput {
  path: string;
  /** `edited`: changed since agentsmesh wrote it. `shared`: a config the user may own too. */
  reason: 'edited' | 'shared';
}

export interface RemovedOutputsPlan {
  /** Unchanged generated files nothing produces any more. */
  stale: string[];
  /** Files nothing produces any more that must not be deleted. */
  kept: KeptOutput[];
}

export interface RemovedOutputsArgs {
  projectRoot: string;
  scope: TargetLayoutScope;
  /** The previous lock's `outputs` map: path to `sha256:` checksum. */
  previousOutputs: Readonly<Record<string, string>>;
  /** Every path this run produces. */
  expectedPaths: readonly string[];
  /** Every target in the config, whether or not this run generates for it. */
  configuredTargets: readonly string[];
}

type Predicate = (rel: string) => boolean;

const CONFIG_FILES: ReadonlySet<string> = new Set(['agentsmesh.yaml', 'agentsmesh.local.yaml']);

function normalize(path: string): string {
  return posix.normalize(path.replaceAll('\\', '/'));
}

/** A lock path that can name a generated file: inside the root, never a canonical source. */
function isUsable(rel: string): boolean {
  if (rel === '.' || rel.startsWith('../') || rel === '..') return false;
  if (rel.startsWith('/') || rel.endsWith('/') || /^[a-zA-Z]:/.test(rel)) return false;
  return !CONFIG_FILES.has(rel) && !rel.split('/').includes('.agentsmesh');
}

async function insideRoot(root: string, rel: string): Promise<boolean> {
  try {
    await assertPathInsideRoot(root, dirname(join(root, rel)));
    return true;
  } catch {
    return false;
  }
}

/** Null for a missing path, and for anything that is not a regular file agentsmesh wrote. */
async function currentChecksum(abs: string): Promise<string | null> {
  try {
    if (!(await lstat(abs)).isFile()) return null;
    const hash = await hashFileForManifest(abs);
    if (hash === null) return null;
    return hash.startsWith('sha256:') ? hash : `sha256:${hash}`;
  } catch {
    return null;
  }
}

function managedByConfigured(targets: readonly string[], scope: TargetLayoutScope): Predicate {
  const files = new Set<string>();
  const dirs: string[] = [];
  for (const target of targets) {
    const managed = getTargetManagedOutputs(target, scope);
    if (!managed) continue;
    for (const file of [...managedOutputFiles(managed), ...(managed.supersededFiles ?? [])]) {
      files.add(file);
    }
    dirs.push(...managed.dirs);
  }
  return (rel) => files.has(rel) || dirs.some((dir) => rel.startsWith(`${dir}/`));
}

function sharedByAnyTarget(scope: TargetLayoutScope): Predicate {
  const shared = new Set<string>();
  for (const id of getAllRegisteredDescriptorIds()) {
    for (const file of getTargetManagedOutputs(id, scope)?.coOwnedFiles ?? []) shared.add(file);
  }
  return (rel) => shared.has(rel);
}

export async function planRemovedOutputs(args: RemovedOutputsArgs): Promise<RemovedOutputsPlan> {
  const expected = new Set(args.expectedPaths.map(normalize));
  const sweptElsewhere = managedByConfigured(args.configuredTargets, args.scope);
  const isShared = sharedByAnyTarget(args.scope);
  const seen = new Set<string>();
  const stale: string[] = [];
  const kept: KeptOutput[] = [];

  for (const [path, locked] of Object.entries(args.previousOutputs)) {
    const rel = normalize(path);
    if (seen.has(rel) || !isUsable(rel) || expected.has(rel) || sweptElsewhere(rel)) continue;
    seen.add(rel);
    if (!(await insideRoot(args.projectRoot, rel))) continue;
    const current = await currentChecksum(join(args.projectRoot, rel));
    if (current === null) continue;
    if (isShared(rel)) kept.push({ path: rel, reason: 'shared' });
    else if (current !== locked) kept.push({ path: rel, reason: 'edited' });
    else stale.push(rel);
  }
  return { stale: stale.sort(), kept: kept.sort((a, b) => (a.path < b.path ? -1 : 1)) };
}

/** Walks up from `relDir`; `rmdir` only succeeds on an empty directory, and the root is never reached. */
async function pruneEmptyDirs(root: string, relDir: string): Promise<void> {
  for (let dir = relDir; dir !== '.' && dir !== '/'; dir = posix.dirname(dir)) {
    try {
      await rmdir(join(root, dir));
    } catch {
      return;
    }
  }
}

/** Deletes planned files, then the directories that became empty because of it. */
export async function deleteRemovedOutputs(
  projectRoot: string,
  paths: readonly string[],
): Promise<void> {
  for (const rel of paths) {
    await rm(join(projectRoot, rel), { force: true });
    await pruneEmptyDirs(projectRoot, posix.dirname(rel));
  }
}

export const NO_REMOVALS: RemovedOutputsPlan = { stale: [], kept: [] };
