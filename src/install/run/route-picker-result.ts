/**
 * Picker dispatch: given the layout-detection picker result, recurse into the
 * marketplace fan-out OR fold a single-candidate result back into a normal
 * `recurseInstall(...)` call.
 *
 * Returns `null` when no recursion happens — the caller falls through to the
 * single-pack install path.
 */

import type { selectInstallCandidates } from '../picker/select-candidates.js';
import { runInstallMarketplace } from './run-install-marketplace.js';
import type { createInstallReport } from '../core/install-report.js';
import type { InstallTarget } from '../core/install-target.js';
import type { InstallReplayScope } from './install-replay.js';
import type { InstallCommandResult } from './single-pack-install.js';

type InstallFlags = Record<string, string | boolean>;

export interface RoutePickerResultArgs {
  readonly pickerResult: ReturnType<typeof selectInstallCandidates>;
  readonly installReport: ReturnType<typeof createInstallReport>;
  readonly sourceArg: string;
  readonly projectRoot: string;
  readonly dryRun: boolean;
  readonly force: boolean;
  readonly useExtends: boolean;
  readonly nameOverride: string;
  readonly replay: InstallReplayScope | undefined;
  /** The caller's full flag bag; scope/consent flags must survive recursion. */
  readonly flags: InstallFlags;
  readonly recurseInstall: (
    flags: InstallFlags,
    args: string[],
    projectRoot: string,
    replay?: InstallReplayScope,
  ) => Promise<InstallCommandResult>;
}

/**
 * Parent flags (`--global`, `--all`, `forceFreshMaterialize`, `--accept-*`)
 * carry through unchanged; only the per-candidate selection is overridden.
 */
function recursedFlags(
  parent: InstallFlags,
  target: InstallTarget,
  overrides: { force: boolean; dryRun: boolean; useExtends: boolean; name: string },
): InstallFlags {
  return {
    ...parent,
    force: overrides.force,
    'dry-run': overrides.dryRun,
    path: target.path ?? '',
    as: target.as ?? '',
    target: target.target ?? '',
    name: overrides.name,
    extends: overrides.useExtends,
  };
}

export async function routePickerResult(
  args: RoutePickerResultArgs,
): Promise<InstallCommandResult | null> {
  const {
    pickerResult,
    installReport,
    sourceArg,
    projectRoot,
    dryRun,
    force,
    useExtends,
    nameOverride,
    replay,
    flags,
    recurseInstall,
  } = args;

  if (pickerResult.isMarketplace && pickerResult.targets.length > 0) {
    const mpResult = await runInstallMarketplace(
      pickerResult.targets,
      async (target) => {
        // Inherit the replay scope: refresh/sync thread the recorded branch
        // pin and elevated consent through it, and a bare `{}` still skips
        // re-acquiring the install lock the outer call already holds.
        const sub = await recurseInstall(
          recursedFlags(flags, target, { force: true, dryRun, useExtends, name: target.name }),
          [sourceArg],
          projectRoot,
          replay ?? {},
        );
        return sub.data;
      },
      installReport,
    );
    return {
      exitCode: mpResult.exitCode,
      data: {
        source: sourceArg,
        mode: 'install' as const,
        installed: mpResult.installed,
        skipped: mpResult.skipped,
        dryRun,
        ...(installReport.brokenResources.length > 0
          ? { brokenResources: installReport.brokenResources }
          : {}),
        ...(installReport.subPackFailures.length > 0
          ? { subPackFailures: installReport.subPackFailures }
          : {}),
        ...(mpResult.skippedSettings ? { skippedSettings: mpResult.skippedSettings } : {}),
      },
    };
  }
  if (!pickerResult.isMarketplace && pickerResult.targets.length === 1) {
    const target = pickerResult.targets[0]!;
    // Pass `replay ?? {}` so the nested `runInstall` skips re-acquiring the
    // install lock we already hold. Marketplace recursion uses the same
    // workaround; normal call sites never reach this branch.
    return recurseInstall(
      recursedFlags(flags, target, { force, dryRun, useExtends, name: nameOverride }),
      [sourceArg],
      projectRoot,
      replay ?? {},
    );
  }
  return null;
}
