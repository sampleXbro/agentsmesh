/**
 * Run the prompt → execute → write flow for a single-pack install, after
 * the marketplace recursion branch has already been ruled out.
 *
 * Extracted from `run-install-locked.ts` so the lock-holding orchestrator
 * stays under the 200-line file cap. This module does not acquire the lock;
 * callers must own it before invoking.
 */

import type { ManualInstallAs } from '../manual/manual-install-mode.js';
import type { ValidatedConfig } from '../../config/core/schema.js';
import type { ParsedInstallSource } from '../source/install-source-types.js';
import type { resolveInstallDiscovery } from '../core/install-discovery.js';
import { deriveSourceType } from '../core/install-discovery.js';
import type { resolveManualInstallPersistence } from '../manual/manual-install-persistence.js';
import type { ScopeContext } from '../../config/core/scope.js';
import type { InstallReplayScope } from './install-replay.js';
import type { createInstallReport } from '../core/install-report.js';
import { executeRunInstallPoolsAndWrite } from './run-install-execute.js';
import { runPromptFlowWithAbort } from './run-install-prompts.js';
import type { InstallData } from '../../cli/command-result.js';

export interface InstallCommandResult {
  exitCode: number;
  data: InstallData;
}

export interface RunSinglePackArgs {
  readonly discovery: Awaited<ReturnType<typeof resolveInstallDiscovery>>;
  readonly installReport: ReturnType<typeof createInstallReport>;
  readonly persisted: Awaited<ReturnType<typeof resolveManualInstallPersistence>>;
  readonly parsed: ParsedInstallSource;
  readonly sourceForYaml: string;
  readonly version: string | undefined;
  readonly pathInRepo: string;
  readonly contentRoot: string;
  readonly config: ValidatedConfig;
  readonly context: ScopeContext;
  readonly dryRun: boolean;
  readonly force: boolean;
  readonly useExtends: boolean;
  readonly forceFreshMaterialize?: boolean;
  readonly explicitAs: ManualInstallAs | undefined;
  readonly nameOverride: string;
  readonly acceptHooks: boolean;
  readonly acceptPermissions: boolean;
  readonly acceptMcp: boolean;
  readonly scope: 'global' | 'project';
  readonly sourceArg: string;
  readonly replay: InstallReplayScope | undefined;
}

export async function runSinglePackInstall(opts: RunSinglePackArgs): Promise<InstallCommandResult> {
  const {
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
  } = opts;
  const tty = process.stdin.isTTY;
  const { prep, implicitPick } = discovery;
  let { narrowed, discoveredFeatures } = discovery;
  try {
    const flow = await runPromptFlowWithAbort({
      discovery,
      contentRoot,
      bypass: force || dryRun || !tty,
    });
    if (flow.aborted) {
      return {
        exitCode: 130,
        data: { source: sourceArg, mode: 'install', installed: [], skipped: [], dryRun },
      };
    }
    narrowed = flow.narrowed ?? narrowed;
    discoveredFeatures = flow.discoveredFeatures ?? discoveredFeatures;
    if (discoveredFeatures.length === 0 && installReport.brokenResources.length > 0) {
      const list = installReport.brokenResources
        .map((b) => `  - ${b.path}: ${b.reason}`)
        .join('\n');
      throw new Error(
        `No installable resources after skipping invalid files (${installReport.brokenResources.length}):\n${list}\n` +
          `Fix the frontmatter in the source files (most often: unquoted scalars containing colons or square brackets), ` +
          `or narrow --path to a subdirectory that excludes them.`,
      );
    }
    const executeResult = await executeRunInstallPoolsAndWrite({
      scope,
      force,
      dryRun,
      tty,
      useExtends,
      forceFreshMaterialize,
      nameOverride,
      explicitAs,
      acceptHooks,
      acceptPermissions,
      acceptMcp,
      config,
      context,
      parsed,
      sourceForYaml,
      version,
      pathInRepo,
      contentRoot,
      persisted,
      replay,
      prep,
      implicitPick,
      narrowed,
      discoveredFeatures,
      sourceType: discovery.layout ? deriveSourceType(discovery.layout) : undefined,
    });
    return {
      exitCode: 0,
      data: {
        source: sourceArg,
        mode: 'install',
        installed: executeResult.installed,
        skipped: executeResult.skipped,
        dryRun,
        ...(installReport.brokenResources.length > 0
          ? { brokenResources: installReport.brokenResources }
          : {}),
        ...(executeResult.skippedSettings?.length
          ? { skippedSettings: executeResult.skippedSettings }
          : {}),
      },
    };
  } finally {
    if (prep.cleanup) await prep.cleanup();
  }
}
