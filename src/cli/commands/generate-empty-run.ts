/**
 * A generate run that produced ZERO outputs (no root rule, every feature
 * disabled, the last pack just uninstalled).
 *
 * Nothing is written, but the files earlier runs generated are now all stale:
 * a full run sweeps them (gated on the lock's `outputs` provenance, exactly
 * like the main path) and records an empty outputs map. Returning early here
 * would leave those orphans live and "expected" forever, so `--check` would
 * keep reporting in-sync.
 */

import { join } from 'node:path';
import { acquireProcessLock } from '../../utils/filesystem/process-lock.js';
import {
  cleanupStaleGeneratedOutputs,
  findStaleGeneratedOutputs,
} from '../../core/generate/stale-cleanup.js';
import { getTargetLayout } from '../../targets/catalog/builtin-targets.js';
import { readLock } from '../../config/core/lock.js';
import { logger } from '../../utils/output/logger.js';
import { writeLockFile } from './generate-lock.js';
import type { GenerateData } from '../command-result.js';
import type { ResolvedExtend } from '../../config/resolve/resolver.js';
import type { GenerateCommandResult, RunGenerateOptions } from './generate.js';

export interface EmptyResultsArgs {
  mode: GenerateData['mode'];
  scope: 'project' | 'global';
  dryRun: boolean;
  context: { canonicalDir: string; configDir: string; rootBase: string };
  resolvedExtends: ResolvedExtend[];
  flags: Record<string, string | boolean>;
  root: string;
  options: RunGenerateOptions;
  activeTargets: string[];
}

/**
 * A run is "filtered" when it targets a subset via `--targets`. Filtered runs
 * merge into the lock's existing outputs (never prune); full runs replace the
 * map outright so disabled targets' entries drop off.
 */
export function isFilteredRun(flags: Record<string, string | boolean>): boolean {
  return flags.targets !== undefined;
}

/**
 * In global scope, returns `'no-global-support'` when every active target
 * lacks a global layout (e.g. cloud-only jules/replit-agent). That, not a
 * missing root rule, is the real reason `generate --global` emitted nothing.
 */
function resolveEmptyReason(
  scope: 'project' | 'global',
  activeTargets: string[],
): GenerateData['emptyReason'] {
  if (scope !== 'global' || activeTargets.length === 0) return undefined;
  const allLackGlobal = activeTargets.every((t) => getTargetLayout(t, 'global') === undefined);
  return allLackGlobal ? 'no-global-support' : undefined;
}

export async function handleEmptyResults(args: EmptyResultsArgs): Promise<GenerateCommandResult> {
  const { mode, scope, dryRun, context, resolvedExtends, flags, root, options, activeTargets } =
    args;
  const data: GenerateData = {
    scope,
    mode,
    files: [],
    summary: { created: 0, updated: 0, unchanged: 0 },
    emptyReason: resolveEmptyReason(scope, activeTargets),
  };
  // Only a full run may read "zero outputs" as "every previous output is
  // stale"; a filtered run cannot re-emit what it did not generate for.
  const prunes = !isFilteredRun(flags);
  const previousLock = await readLock(context.canonicalDir);
  const sweep = {
    projectRoot: context.rootBase,
    targets: activeTargets,
    expectedPaths: [],
    scope,
    generatedOutputs: Object.keys(previousLock?.outputs ?? {}),
  };

  if (mode === 'check') {
    const stale = prunes ? await findStaleGeneratedOutputs(sweep) : [];
    for (const path of stale) {
      logger.error(`[check] stale ${scope === 'global' ? `~/${path}` : path}`);
    }
    if (stale.length > 0) {
      logger.error("Generated files are out of sync. Run 'agentsmesh generate' to remove them.");
    }
    return { exitCode: stale.length === 0 ? 0 : 1, data, lockWritten: false };
  }

  let lockWritten = false;
  if (!dryRun) {
    const release = await acquireProcessLock(join(context.canonicalDir, '.generate.lock'), {
      label: 'generate lock',
    });
    try {
      if (prunes) await cleanupStaleGeneratedOutputs(sweep);
      // Full run: the outputs map becomes empty. Filtered run: `writeLockFile`
      // merges `{}` into the previous map, so earlier provenance survives.
      lockWritten = await writeLockFile(context, resolvedExtends, {}, !prunes);
    } finally {
      await release();
    }
  }

  if (options.printMatrix !== false) {
    const { runMatrix } = await import('./matrix.js');
    const { renderMatrix } = await import('../renderers/matrix.js');
    const matrixResult = await runMatrix(flags, root);
    renderMatrix(matrixResult, { verbose: flags.verbose === true });
  }

  return { exitCode: 0, data, lockWritten };
}
