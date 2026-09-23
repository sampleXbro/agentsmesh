/**
 * Body of `runInstall` that runs while the `.install.lock` is held.
 *
 * Split into three modules to keep each file under the 200-line cap:
 *   - `run-install-locked.ts` (this file) — top-level dispatch: parse source,
 *     resolve discovery, route to picker → marketplace recursion OR single-pack.
 *   - `run-install-marketplace.ts` — marketplace sub-pack fan-out.
 *   - `single-pack-install.ts` — prompt + execute + write for one pack.
 */

import { join, normalize } from 'node:path';
import { loadScopedConfig } from '../../config/core/scope.js';
import { exists } from '../../utils/filesystem/fs.js';
import { resolveInstallResolvedPath } from './run-install-resolve.js';
import { isGitAvailable } from '../source/git-pin.js';
import { parseInstallSource } from '../source/url-parser.js';
import { resolveInstallDiscovery } from '../core/install-discovery.js';
import { selectInstallCandidates } from '../picker/select-candidates.js';
import { bootstrapPlugins } from '../../plugins/bootstrap-plugins.js';
import { type InstallReplayScope } from './install-replay.js';
import { resolveManualInstallPersistence } from '../manual/manual-install-persistence.js';
import { runSinglePackInstall, type InstallCommandResult } from './single-pack-install.js';
import { routePickerResult } from './route-picker-result.js';
import { handleSync } from './run-install-sync-locked.js';
import { createInstallReport } from '../core/install-report.js';
import { logger } from '../../utils/output/logger.js';
import { ignoredRootSettings, rootSettingsNotice } from '../source/root-settings-notice.js';
import type { ManualInstallAs } from '../manual/manual-install-mode.js';

export type { InstallCommandResult };

export interface RunInstallLockedArgs {
  args: string[];
  /** Raw flag bag as received; the picker recursion inherits it. */
  flags: Record<string, string | boolean>;
  projectRoot: string;
  replay: InstallReplayScope | undefined;
  sync: boolean;
  dryRun: boolean;
  force: boolean;
  useExtends: boolean;
  all?: boolean;
  forceFreshMaterialize?: boolean;
  explicitPath?: string;
  explicitTarget?: string;
  explicitAs?: ManualInstallAs;
  nameOverride: string;
  acceptHooks: boolean;
  acceptPermissions: boolean;
  acceptMcp: boolean;
  scope: 'global' | 'project';
  sourceArg: string | undefined;
  recurseInstall: (
    flags: Record<string, string | boolean>,
    args: string[],
    projectRoot: string,
    replay?: InstallReplayScope,
  ) => Promise<InstallCommandResult>;
}

function assertPathStaysInRepo(pathInRepo: string, originalPath: string): void {
  if (!pathInRepo) return;
  const normalized = normalize(pathInRepo).replace(/\\/g, '/');
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new Error(
      `Install --path "${originalPath}" escapes the source root. Path must stay within the source.`,
    );
  }
}

export async function runInstallLocked(opts: RunInstallLockedArgs): Promise<InstallCommandResult> {
  const synced = await handleSync(opts);
  if (synced) return synced;

  const {
    projectRoot,
    replay,
    dryRun,
    force,
    useExtends,
    all,
    forceFreshMaterialize,
    explicitPath,
    explicitTarget,
    explicitAs,
    nameOverride,
    acceptHooks,
    acceptPermissions,
    acceptMcp,
    scope,
    sourceArg,
  } = opts;

  if (!sourceArg) {
    throw new Error(
      'Missing source. Usage: agentsmesh install <source> [--path ...] [--target ...]',
    );
  }
  const tty = process.stdin.isTTY;
  if (!tty && !force && !dryRun) {
    throw new Error('Non-interactive terminal: use --force or --dry-run for agentsmesh install.');
  }
  const { config, context } = await loadScopedConfig(projectRoot, scope);
  await bootstrapPlugins(config, projectRoot);
  const parsed = await parseInstallSource(sourceArg, context.configDir, explicitPath);
  if (parsed.kind !== 'local' && !(await isGitAvailable())) {
    throw new Error('git is required for remote installs. Please install git and try again.');
  }
  const { resolvedPath, sourceForYaml, version } = await resolveInstallResolvedPath(
    parsed,
    sourceArg,
  );
  const pathInRepo = parsed.pathInRepo.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
  assertPathStaysInRepo(pathInRepo, parsed.pathInRepo);
  const contentRoot = pathInRepo ? join(resolvedPath, pathInRepo) : resolvedPath;
  if (!(await exists(contentRoot))) throw new Error(`Install path does not exist: ${contentRoot}`);
  const ignoredSettings = await ignoredRootSettings(contentRoot);
  if (ignoredSettings.length > 0) logger.warn(rootSettingsNotice(ignoredSettings));
  const persisted = await resolveManualInstallPersistence({
    as: explicitAs,
    contentRoot,
    pathInRepo,
  });
  const installReport = createInstallReport();
  const parseOpts = {
    onParseError: (err: Error, filePath: string): void => {
      installReport.brokenResources.push({
        path: filePath,
        kind: 'frontmatter' as const,
        reason: err.message,
      });
    },
  };

  const discovery = await resolveInstallDiscovery({
    resolvedPath,
    contentRoot,
    pathInRepo,
    explicitTarget,
    explicitAs,
    replayPick: replay?.pick,
    parseOpts,
  });

  // Picker: check if layout detection found targets (marketplace or flat collections)
  if (discovery.layout && !explicitAs && !explicitTarget && !explicitPath) {
    const pickerResult = selectInstallCandidates({
      layout: discovery.layout,
      sourceName:
        nameOverride || (parsed.org && parsed.repo ? `${parsed.org}-${parsed.repo}` : 'source'),
      sourceForYaml,
      explicitPath,
      explicitAs,
      explicitTarget,
      all,
      force,
      tty,
    });
    const routed = await routePickerResult({
      pickerResult,
      installReport,
      sourceArg,
      projectRoot,
      dryRun,
      force,
      useExtends,
      nameOverride,
      replay,
      flags: opts.flags,
      recurseInstall: opts.recurseInstall,
    });
    if (routed !== null) return routed;
  }

  return runSinglePackInstall({
    discovery,
    installReport,
    persisted,
    parsed,
    sourceForYaml,
    version,
    pathInRepo,
    contentRoot,
    config,
    context,
    dryRun,
    force,
    useExtends,
    forceFreshMaterialize,
    explicitAs,
    nameOverride,
    acceptHooks,
    acceptPermissions,
    acceptMcp,
    scope,
    sourceArg,
    replay,
  });
}
