/**
 * N-target dispatcher for marketplace installs.
 *
 * Iterates `InstallTarget[]` in declaration order. Each target is
 * executed via the existing single-pack flow. Per-target try/catch
 * isolates failures so partial success is possible.
 *
 * Exit-code policy:
 *  - All success → 0
 *  - Partial success → 0 with subPackFailures populated
 *  - All failure → 1
 */

import type { InstallTarget } from '../core/install-target.js';
import type { InstallReport } from '../core/install-report.js';
import type { SkippedSettings } from '../../canonical/load/unmanaged-settings.js';

export interface MarketplaceExecutor {
  (target: InstallTarget): Promise<{
    installed: Array<{ kind: string; name: string; path: string }>;
    skipped: Array<{ kind: string; name: string; reason: string }>;
    skippedSettings?: SkippedSettings[];
  }>;
}

export interface MarketplaceResult {
  exitCode: number;
  installed: Array<{ kind: string; name: string; path: string }>;
  skipped: Array<{ kind: string; name: string; reason: string }>;
  /** From the last successful sub-pack's generate, which saw every installed pack. */
  skippedSettings?: SkippedSettings[];
}

export async function runInstallMarketplace(
  targets: readonly InstallTarget[],
  execute: MarketplaceExecutor,
  report: InstallReport,
): Promise<MarketplaceResult> {
  const allInstalled: MarketplaceResult['installed'] = [];
  const allSkipped: MarketplaceResult['skipped'] = [];
  let skippedSettings: SkippedSettings[] | undefined;
  let successCount = 0;

  for (const target of targets) {
    try {
      const result = await execute(target);
      allInstalled.push(...result.installed);
      allSkipped.push(...result.skipped);
      skippedSettings = result.skippedSettings;
      successCount += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      report.subPackFailures.push({
        name: target.name,
        path: target.path ?? '.',
        error: message,
      });
    }
  }

  return {
    exitCode: successCount > 0 ? 0 : 1,
    installed: allInstalled,
    skipped: allSkipped,
    ...(skippedSettings ? { skippedSettings } : {}),
  };
}
