/**
 * agentsmesh uninstall orchestration.
 *
 * Threads the install lock around the same plan → decide → apply → generate
 * pipeline used during install. Output mirrors `runInstall` so the CLI
 * dispatcher can route both commands through `handleResult`.
 *
 * Phases:
 *   1. Parse flags + names.
 *   2. Acquire install lock for the canonical dir.
 *   3. `planUninstall` against `installs.yaml` + `agentsmesh.yaml` extends.
 *   4. `gatherUninstallDecisions` — legacy migrate, detect drift, prompt.
 *      An `[a]bort` from the prompt short-circuits to exit 130 (no writes).
 *   5. `--dry-run`: log + return; never reach apply.
 *   6. `applyUninstall` per decision (`keep-modified` nulls out `packDir`).
 *   7. Final `runGenerate()` so `cleanupStaleGeneratedOutputs` evicts the
 *      now-orphaned target files. Skipped under `--keep-generated`.
 */

import { join } from 'node:path';
import { loadScopedConfig } from '../../config/core/scope.js';
import { bootstrapPlugins } from '../../plugins/bootstrap-plugins.js';
import { acquireInstallLock } from '../lock/install-lock.js';
import { readInstallManifest } from '../core/install-manifest.js';
import { runPostOperationGenerate } from '../run/post-install-generate.js';
import { logger } from '../../utils/output/logger.js';
import { planUninstall, type UninstallRemovalPlan } from './plan-uninstall.js';
import { gatherUninstallDecisions } from './uninstall-decisions.js';
import { assertUninstallPacksInsideProject } from '../pack/pack-containment.js';
import { applyUninstall } from './apply-uninstall.js';
import { appliedEntry, buildSkipped, previewEntries } from './uninstall-result.js';
import { defaultUninstallAdapter, parseUninstallNames } from './uninstall-io.js';
import type { PromptAdapter } from '../prompts/prompt-types.js';
import type { UninstallData, UninstallRemovedEntry } from '../../cli/command-result.js';

export interface UninstallCommandResult {
  exitCode: number;
  data: UninstallData;
}

export interface RunUninstallOptions {
  /** Test seam: override the default stdin/stdout-backed modification prompt. */
  readonly promptAdapter?: PromptAdapter;
  /** Test seam: treat the run as interactive regardless of `process.stdin.isTTY`. */
  readonly assumeTty?: boolean;
}

export async function runUninstall(
  flags: Record<string, string | boolean>,
  args: readonly string[],
  projectRoot: string,
  options: RunUninstallOptions = {},
): Promise<UninstallCommandResult> {
  const scope: 'project' | 'global' = flags.global === true ? 'global' : 'project';
  const all = flags.all === true;
  const force = flags.force === true;
  const dryRun = flags['dry-run'] === true;
  const keepPack = flags['keep-pack'] === true;
  const keepGenerated = flags['keep-generated'] === true;
  const tty = options.assumeTty === true || process.stdin.isTTY;

  const names = parseUninstallNames(args);

  const isJson = flags.json === true;

  // Validation failures land here as `{ exitCode: 1 }` so they render via the
  // standard logger.error path and surface a useful message in `--json` mode.
  // Under `--json` the message belongs in the envelope's `error` field; emitting
  // it on stderr here would mix channels with the JSON payload on stdout, so
  // suppress the logger.error in that case.
  function validationFailure(message: string): UninstallCommandResult {
    if (!isJson) logger.error(message);
    return {
      exitCode: 1,
      data: { scope, mode: 'uninstall', removed: [], skipped: [], failed: [], dryRun },
    };
  }

  if (!all && names.length === 0) {
    return validationFailure(
      'Missing install name. Usage: agentsmesh uninstall <name>[,<name>...] [--all]',
    );
  }
  if (!tty && !force && !dryRun) {
    return validationFailure(
      'Non-interactive terminal: use --force or --dry-run for agentsmesh uninstall.',
    );
  }

  const { config, context } = await loadScopedConfig(projectRoot, scope);
  await bootstrapPlugins(config, projectRoot);
  const lockRelease = await acquireInstallLock(context.canonicalDir);

  try {
    const installs = await readInstallManifest(context.canonicalDir);
    const packsDir = join(context.canonicalDir, 'packs');

    const plan = planUninstall({
      names,
      all,
      keepPack,
      keepGenerated,
      installs,
      extends: config.extends,
      packsDir,
    });

    await assertUninstallPacksInsideProject(
      context.canonicalDir,
      plan.removals.map((r) => r.packDir),
    );

    const { decisions, aborted } = await gatherUninstallDecisions(plan.removals, packsDir, {
      adapter: options.promptAdapter ?? defaultUninstallAdapter(),
      warn: (m) => logger.warn(m),
      bypassPrompts: force || dryRun || !tty,
      keepPack,
      dryRun,
    });

    if (aborted) {
      logger.warn('Uninstall aborted at modification prompt.');
      return {
        exitCode: 130,
        data: { scope, mode: 'uninstall', removed: [], skipped: [], failed: [], dryRun },
      };
    }

    for (const removal of plan.removals) {
      for (const w of removal.warnings) logger.warn(w);
    }

    if (dryRun) {
      for (const d of decisions) logger.info(`[dry-run] Would uninstall pack "${d.plan.name}".`);
      return {
        exitCode: 0,
        data: {
          scope,
          mode: 'uninstall',
          removed: previewEntries(decisions, context.rootBase, packsDir),
          skipped: buildSkipped(plan.skipped),
          failed: [],
          dryRun: true,
        },
      };
    }

    const configPath = join(context.configDir, 'agentsmesh.yaml');
    const removed: UninstallRemovedEntry[] = [];
    const failed: Array<{ name: string; reason: string }> = [];
    for (const d of decisions) {
      const effectivePlan: UninstallRemovalPlan =
        d.action === 'keep-modified' ? { ...d.plan, packDir: null } : d.plan;
      try {
        const applied = await applyUninstall({
          plan: effectivePlan,
          canonicalDir: context.canonicalDir,
          configPath,
          config,
        });
        removed.push(appliedEntry(d, applied, context.rootBase, packsDir));
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        failed.push({ name: d.plan.name, reason });
        // Surviving packs continue; we report the per-pack failure on stderr
        // (skipped under --json so the envelope is the single channel).
        if (!isJson) {
          logger.error(`Failed to uninstall "${d.plan.name}": ${reason}`);
        }
      }
    }

    // Always run post-operation generate over surviving installs so the tool
    // tree stays consistent with the (possibly partially mutated) installs.yaml.
    if (!keepGenerated && removed.length > 0) {
      await runPostOperationGenerate('uninstall', scope, context.rootBase);
    } else if (keepGenerated && removed.length > 0) {
      logger.warn(
        '--keep-generated: target files derived from the removed pack(s) may be stale until the next generate.',
      );
    }

    return {
      exitCode: failed.length > 0 ? 1 : 0,
      data: {
        scope,
        mode: 'uninstall',
        removed,
        skipped: buildSkipped(plan.skipped),
        failed,
        dryRun: false,
      },
    };
  } finally {
    await lockRelease();
  }
}
