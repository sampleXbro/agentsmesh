/**
 * `generate --check` and the files of a target the config no longer lists.
 */

import { readLock } from '../../config/core/lock.js';
import { planRemovedOutputs } from '../../core/generate/removed-outputs.js';
import { removalFields } from '../generate-data.js';
import { isFilteredRun } from './generate-empty-run.js';
import type { GenerateResult } from '../../core/result-types.js';
import type { GenerateCommandResult } from './generate.js';

export interface RemovedOutputDriftArgs {
  results: GenerateResult[];
  scope: 'project' | 'global';
  context: { canonicalDir: string; rootBase: string };
  configuredTargets: string[];
  flags: Record<string, string | boolean>;
}

/**
 * Files of a dropped target that a real run would delete are drift (exit 1).
 * Files it would keep are listed in the data and never fail the check.
 */
export async function withRemovedOutputDrift(
  result: GenerateCommandResult,
  args: RemovedOutputDriftArgs,
): Promise<GenerateCommandResult> {
  if (isFilteredRun(args.flags)) return result;
  const previousLock = await readLock(args.context.canonicalDir);
  const plan = await planRemovedOutputs({
    projectRoot: args.context.rootBase,
    scope: args.scope,
    previousOutputs: previousLock?.outputs ?? {},
    expectedPaths: args.results.map((r) => r.path),
    configuredTargets: args.configuredTargets,
  });
  if (plan.stale.length === 0 && plan.kept.length === 0) return result;
  return {
    ...result,
    exitCode: plan.stale.length > 0 ? Math.max(result.exitCode, 1) : result.exitCode,
    data: { ...result.data, ...removalFields(plan.stale, plan.kept) },
  };
}
