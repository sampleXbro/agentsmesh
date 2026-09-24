/**
 * Helper functions for the generate command.
 * Extracted from generate.ts to keep file sizes under 200 lines.
 */

import { join } from 'node:path';
import { writeFileAtomic } from '../../utils/filesystem/fs.js';
import { acquireProcessLock } from '../../utils/filesystem/process-lock.js';
import { cleanupStaleGeneratedOutputs } from '../../core/generate/stale-cleanup.js';
import { assertOutputBoundary, ensureSafeOutputPath } from './generate-path.js';
import { writeLockFile } from './generate-lock.js';
import { isFilteredRun } from './generate-empty-run.js';
import { buildOutputChecksums } from '../../config/core/lock-outputs.js';
import { readLock } from '../../config/core/lock.js';
import type { GenerateData } from '../command-result.js';
import type { ResolvedExtend } from '../../config/resolve/resolver.js';
import type { GenerateResult } from '../../core/result-types.js';
import type { GenerateCommandResult, RunGenerateOptions } from './generate.js';

export { handleEmptyResults, type EmptyResultsArgs } from './generate-empty-run.js';

export function buildCheckResult(
  results: GenerateResult[],
  scope: 'project' | 'global',
): GenerateCommandResult {
  const actionable = results.filter((r) => r.status !== 'skipped');
  const drifted = actionable.filter((r) => r.status !== 'unchanged');
  const files = actionable.map((r) => ({
    path: r.path,
    target: r.target,
    status: r.status as 'created' | 'updated' | 'unchanged',
  }));
  const exitCode = drifted.length === 0 ? 0 : 1;
  const data: GenerateData = { scope, mode: 'check', files, summary: buildSummary(actionable) };
  return { exitCode, data, lockWritten: false };
}

export interface GenerateOrDryRunArgs {
  results: GenerateResult[];
  dryRun: boolean;
  scope: 'project' | 'global';
  mode: GenerateData['mode'];
  context: { canonicalDir: string; configDir: string; rootBase: string };
  activeTargets: string[];
  /** Every target in the config, so cleanup can spot the ones this run skipped. */
  configuredTargets: string[];
  resolvedExtends: ResolvedExtend[];
  flags: Record<string, string | boolean>;
  root: string;
  options: RunGenerateOptions;
}

export async function handleGenerateOrDryRun(
  args: GenerateOrDryRunArgs,
): Promise<GenerateCommandResult> {
  const {
    results,
    dryRun,
    scope,
    mode,
    context,
    activeTargets,
    configuredTargets,
    resolvedExtends,
    flags,
    root,
    options,
  } = args;

  const inactiveTargets = configuredTargets.filter((t) => !activeTargets.includes(t));
  await assertOutputBoundary(results, {
    projectRoot: context.rootBase,
    targets: activeTargets,
    scope,
    inactiveTargets,
  });

  let lockWritten = false;
  const release = dryRun
    ? null
    : await acquireProcessLock(join(context.canonicalDir, '.generate.lock'), {
        label: 'generate lock',
      });
  try {
    if (!dryRun) {
      for (const r of results) {
        if (r.status === 'created' || r.status === 'updated') {
          const fullPath = await ensureSafeOutputPath(context.rootBase, r.path, r.target);
          await writeFileAtomic(fullPath, r.content);
        }
      }
      // The lock on disk is still the PREVIOUS run's until `writeLockFile`
      // below, so its outputs map is exactly the provenance the sweep needs.
      // Absent (fresh project, or a lock predating the map) → an empty set, so
      // the sweep deletes nothing this run and provenance exists from the next
      // one on. The alternative — deleting on missing provenance — is the bug
      // itself, and it lands hardest on first-run and just-upgraded users.
      const previousLock = await readLock(context.canonicalDir);
      await cleanupStaleGeneratedOutputs({
        projectRoot: context.rootBase,
        targets: activeTargets,
        expectedPaths: results.map((result) => result.path),
        scope,
        generatedOutputs: Object.keys(previousLock?.outputs ?? {}),
        inactiveTargets,
      });
      lockWritten = await writeLockFile(
        context,
        resolvedExtends,
        buildOutputChecksums(results),
        isFilteredRun(flags),
        inactiveTargets,
      );
    }
  } finally {
    if (release) await release();
  }

  if (options.printMatrix !== false) {
    const { runMatrix } = await import('./matrix.js');
    const { renderMatrix } = await import('../renderers/matrix.js');
    const matrixResult = await runMatrix(flags, root);
    renderMatrix(matrixResult, { verbose: flags.verbose === true });
  }

  const actionable = results.filter((r) => r.status !== 'skipped');
  const files = actionable.map((r) => ({
    path: r.path,
    target: r.target,
    status: r.status as 'created' | 'updated' | 'unchanged',
  }));
  const data: GenerateData = { scope, mode, files, summary: buildSummary(actionable) };
  return { exitCode: 0, data, lockWritten };
}

export function buildSummary(results: Array<{ status: string }>): GenerateData['summary'] {
  return {
    created: results.filter((r) => r.status === 'created').length,
    updated: results.filter((r) => r.status === 'updated').length,
    unchanged: results.filter((r) => r.status === 'unchanged').length,
  };
}
