/**
 * Eviction of generated outputs a run no longer emits.
 *
 * `managedOutputs.files` is a static list a descriptor owns, but only the lock's
 * provenance says whether *this* copy is ours: a hand-authored `AGENTS.md` on a
 * first run is not. `supersededFiles` are the one exception, evicted whenever
 * the primary root is emitted. `managedOutputs.dirs` is different: the sweep discovers
 * whatever is inside, and most of those directories are shared — the tool's own
 * UI writes there (`.kiro/hooks`, `.cursor/rules`), users hand-author there
 * (`.claude/skills`), and agentsmesh's own importers read foreign files back
 * out of them. Deleting everything found is how a hook Kiro wrote disappeared.
 *
 * So a dir-discovered file needs provenance before it can be deleted, and
 * `coOwnedFiles` cannot supply it: the contents are dynamic (one per rule,
 * command, agent, skill), so no descriptor can enumerate them. The previous
 * run's lock `outputs` map is that record — at cleanup time the lock on disk is
 * still the previous run's, because `writeLockFile` runs after this.
 */

import { readdir, rm } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { exists } from '../../utils/filesystem/fs.js';
import { assertPathInsideRoot } from '../../utils/filesystem/path-containment.js';
import {
  getBuiltinTargetDefinition,
  getTargetLayout,
  getTargetManagedOutputs,
} from '../../targets/catalog/builtin-targets.js';
import { getDescriptor } from '../../targets/catalog/registry.js';
import type { TargetLayoutScope } from '../../targets/catalog/target-descriptor.js';

async function listFiles(root: string, base = root): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const abs = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(abs, base)));
      continue;
    }
    files.push(relative(base, abs).replace(/\\/g, '/'));
  }
  return files;
}

interface StaleGeneratedOutputsArgs {
  projectRoot: string;
  targets: string[];
  expectedPaths: string[];
  scope?: TargetLayoutScope;
  /**
   * Paths the PREVIOUS run generated — the lock's `outputs` keys. Provenance
   * for the directory sweep only: a discovered file is deletable when this set
   * claims it, and left alone otherwise.
   *
   * Omitted by report-only callers. `agentsmesh check` must omit it: it passes
   * the lock's own outputs map as `expectedPaths`, so gating there would make
   * its stale set empty for every input and silently kill the drift gate.
   */
  generatedOutputs?: readonly string[];
  /**
   * Configured targets this run did NOT generate for (`--targets` filtering).
   * Every directory they also manage is skipped: a shared dir such as
   * `.agents/skills` holds outputs a filtered run cannot re-emit, and
   * provenance cannot rescue them because the lock records paths with no target
   * attribution — agentsmesh really did write them, just for another target.
   * The cost is that a shared dir is pruned only on an unfiltered run, matching
   * the rule the lock already follows (filtered runs merge, never prune).
   */
  inactiveTargets?: readonly string[];
}

/**
 * Deleting requires provenance. Report callers may omit `generatedOutputs`;
 * this path may not, so no future call site can silently opt back in to
 * deleting every file it finds under a managed directory.
 */
interface CleanupStaleGeneratedOutputsArgs extends StaleGeneratedOutputsArgs {
  generatedOutputs: readonly string[];
}

/** Managed dirs belonging to targets this run skipped; left untouched. */
function retainedDirs(
  inactiveTargets: readonly string[],
  scope: TargetLayoutScope,
): ReadonlySet<string> {
  const dirs = new Set<string>();
  for (const target of inactiveTargets) {
    for (const dir of getTargetManagedOutputs(target, scope)?.dirs ?? []) dirs.add(dir);
  }
  return dirs;
}

function primaryEmitted(
  target: string,
  scope: TargetLayoutScope,
  expected: ReadonlySet<string>,
): boolean {
  const descriptor = getBuiltinTargetDefinition(target) ?? getDescriptor(target);
  const primary =
    getTargetLayout(target, scope)?.rootInstructionPath ??
    descriptor?.generators.primaryRootInstructionPath;
  return primary !== undefined && expected.has(primary);
}

export async function findStaleGeneratedOutputs(
  args: StaleGeneratedOutputsArgs,
): Promise<string[]> {
  const expected = new Set(args.expectedPaths);
  const stale = new Set<string>();
  const scope = args.scope ?? 'project';
  const generated =
    args.generatedOutputs === undefined ? null : new Set<string>(args.generatedOutputs);
  const retained = retainedDirs(args.inactiveTargets ?? [], scope);

  // Shared user configs (their model, auth and editor settings live there). A run
  // that emits nothing for one must leave it alone rather than delete it. Collected
  // across every target first: a directory sweep for one target can otherwise reach
  // a file another target co-owns.
  const coOwned = new Set<string>();

  for (const target of args.targets) {
    const managed = getTargetManagedOutputs(target, scope);
    if (!managed) continue;
    for (const file of managed.coOwnedFiles ?? []) coOwned.add(file);
    for (const file of managed.files) {
      // Same provenance rule as the directory sweep: a static path agentsmesh
      // never wrote (first run, hand-authored AGENTS.md) is not ours to evict.
      if (generated !== null && !generated.has(file)) continue;
      stale.add(file);
    }
    // Superseded alternates go once this run emitted the primary root: the
    // tool would otherwise load the same rules from both locations.
    if (primaryEmitted(target, scope, expected)) {
      for (const file of managed.supersededFiles ?? []) stale.add(file);
    }
    for (const dir of managed.dirs) {
      if (retained.has(dir)) continue;
      const absDir = join(args.projectRoot, dir);
      await assertPathInsideRoot(args.projectRoot, absDir);
      if (!(await exists(absDir))) continue;
      for (const file of await listFiles(absDir)) {
        const relPath = `${dir}/${file}`.replace(/\/+/g, '/');
        // No provenance record → the file is the tool's or the user's, not ours.
        if (generated !== null && !generated.has(relPath)) continue;
        stale.add(relPath);
      }
    }
  }

  const found: string[] = [];
  for (const relPath of stale) {
    if (expected.has(relPath) || coOwned.has(relPath)) continue;
    await assertPathInsideRoot(args.projectRoot, dirname(join(args.projectRoot, relPath)));
    if (await exists(join(args.projectRoot, relPath))) found.push(relPath);
  }
  return found.sort();
}

/**
 * Files sitting inside a managed directory that the previous run's lock does not
 * claim — the tool's own output (`.kiro/hooks/*.kiro.hook`) or something the
 * user hand-authored. Never deletable, so `check` surfaces them as a notice
 * rather than as drift: reporting them as stale generated output exits 1 with no
 * remedy, but staying silent hides a rule added straight into `.claude/rules`
 * instead of canonical.
 */
export async function findUntrackedManagedDirFiles(
  args: CleanupStaleGeneratedOutputsArgs,
): Promise<string[]> {
  const scope = args.scope ?? 'project';
  const generated = new Set<string>(args.generatedOutputs);
  const retained = retainedDirs(args.inactiveTargets ?? [], scope);
  const found = new Set<string>();

  for (const target of args.targets) {
    for (const dir of getTargetManagedOutputs(target, scope)?.dirs ?? []) {
      if (retained.has(dir)) continue;
      const absDir = join(args.projectRoot, dir);
      await assertPathInsideRoot(args.projectRoot, absDir);
      if (!(await exists(absDir))) continue;
      for (const file of await listFiles(absDir)) {
        const relPath = `${dir}/${file}`.replace(/\/+/g, '/');
        if (!generated.has(relPath)) found.add(relPath);
      }
    }
  }
  return [...found].sort();
}

export async function cleanupStaleGeneratedOutputs(
  args: CleanupStaleGeneratedOutputsArgs,
): Promise<void> {
  for (const relPath of await findStaleGeneratedOutputs(args)) {
    await rm(join(args.projectRoot, relPath), { recursive: true, force: true });
  }
}
