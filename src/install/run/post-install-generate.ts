/**
 * Best-effort post-install / post-uninstall `runGenerate()` runner.
 *
 * The install pipeline writes the pack + `installs.yaml` BEFORE calling
 * `runGenerate()` so the user's primary intent (install / uninstall the
 * pack) has already committed by the time we render targets. A failure in
 * generate (e.g. the broken-link validator throwing on a pack body the
 * user accepted with `[l]eave-with-warnings`) must not roll back the
 * commit — we log the failure and tell the user to run `agentsmesh
 * generate` manually after resolving the underlying source.
 *
 * Shared between `run-install-execute.ts` and `run-uninstall.ts` so the
 * try/catch + warn pattern stays in one place.
 */

import { runGenerate } from '../../cli/commands/generate.js';
import { renderGenerate } from '../../cli/renderers/generate.js';
import { logger } from '../../utils/output/logger.js';
import type { SkippedSettings } from '../../canonical/load/unmanaged-settings.js';

export type PostGenerateMode = 'install' | 'uninstall' | 'refresh';

/** Returns the settings the generate skipped from packs and extends; empty if it threw. */
export async function runPostOperationGenerate(
  mode: PostGenerateMode,
  scope: 'project' | 'global',
  rootBase: string,
): Promise<SkippedSettings[]> {
  const action =
    mode === 'install'
      ? 'Pack is installed'
      : mode === 'refresh'
        ? 'Refresh is committed'
        : 'Uninstall is committed';
  const genFlag = scope === 'global' ? ' --global' : '';
  try {
    const genResult = await runGenerate(scope === 'global' ? { global: true } : {}, rootBase, {
      printMatrix: false,
    });
    renderGenerate(genResult);
    if (genResult.exitCode !== 0) {
      logger.warn(`Generate failed after ${mode}. ${action}; run agentsmesh generate${genFlag}.`);
    }
    return genResult.data.skippedSettings ?? [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Generate failed after ${mode}: ${msg}`);
    logger.warn(`${action}; run agentsmesh generate${genFlag} after resolving the issue.`);
    return [];
  }
}
