import type { ValidatedConfig } from '../../config/core/schema.js';
import { logger } from '../../utils/output/logger.js';
import { runPostOperationGenerate } from './post-install-generate.js';
import { writeInstallAsExtend } from '../core/install-extend-entry.js';
import { installAsPack } from './run-install-pack.js';
import type { InstallReplayScope } from './install-replay.js';
import { buildInstalledList } from './run-install-result.js';
import { selectInstall } from './run-install-selection.js';
import type { ParsedInstallSource } from '../source/parse-install-source.js';
import type { ManualInstallPersistence } from '../manual/manual-install-persistence.js';
import type { ManualInstallAs } from '../manual/manual-install-mode.js';
import type { ExtendPick } from '../../config/core/schema.js';
import type { CanonicalFiles } from '../../core/types.js';
import type { InstallDiscoveryPrep } from '../core/install-discovery.js';
import { consentedArtifactsForManifest, resolveOriginalRef } from './elevated-consent-replay.js';

export interface RunInstallExecuteArgs {
  scope: 'global' | 'project';
  force: boolean;
  dryRun: boolean;
  tty: boolean;
  useExtends: boolean;
  forceFreshMaterialize?: boolean;
  nameOverride: string;
  explicitAs?: ManualInstallAs;
  /**
   * Per-artifact consent for elevated install artifacts shipped by the source
   * (hooks/permissions/mcp). For non-local sources these are stripped by
   * default; the user has to opt in explicitly.
   */
  acceptHooks: boolean;
  acceptPermissions: boolean;
  acceptMcp: boolean;
  config: ValidatedConfig;
  context: { configDir: string; canonicalDir: string; rootBase: string };
  parsed: ParsedInstallSource;
  sourceForYaml: string;
  version: string | undefined;
  pathInRepo: string;
  /** Upstream source root; forwarded to the pack writer for preserved-file harvesting. */
  contentRoot: string;
  persisted: ManualInstallPersistence;
  replay?: InstallReplayScope;
  prep: InstallDiscoveryPrep;
  implicitPick: ExtendPick | undefined;
  narrowed: CanonicalFiles;
  discoveredFeatures: string[];
  /** Classifier verdict (e.g. `anthropic-skill-pack`); recorded in install manifest. */
  sourceType?: string;
}

export interface InstallExecuteResult {
  installed: Array<{ kind: string; name: string; path: string }>;
  skipped: Array<{ kind: string; name: string; reason: string }>;
}

/** Select what to install (see run-install-selection.ts), then write it as a pack or an extend. */
export async function executeRunInstallPoolsAndWrite(
  args: RunInstallExecuteArgs,
): Promise<InstallExecuteResult> {
  const { scope, dryRun, useExtends, forceFreshMaterialize, nameOverride, explicitAs } = args;
  const { config, context, parsed, sourceForYaml, version, contentRoot, persisted } = args;
  const { replay, prep, sourceType } = args;
  const { consent, narrowed, selected, skipped, entryFeatures, pick, entryName } =
    await selectInstall(args);

  let installed = buildInstalledList(selected, entryName);
  const originalRef = resolveOriginalRef(parsed, replay);
  const acceptedElevated = consentedArtifactsForManifest(narrowed, consent);

  if (useExtends) {
    await writeInstallAsExtend({
      configDir: context.configDir,
      config,
      entryArgs: {
        name: entryName,
        source: sourceForYaml,
        version,
        features: entryFeatures,
        path: persisted.pathInRepo,
        pick,
        yamlTarget: prep.yamlTarget,
        as: explicitAs,
      },
      dryRun,
    });
    if (dryRun) return { installed, skipped };
  } else {
    const packName = await installAsPack({
      canonicalDir: context.canonicalDir,
      packName: entryName,
      narrowed,
      selected,
      sourceForYaml,
      version,
      sourceKind: parsed.kind,
      entryFeatures,
      pick,
      yamlTarget: prep.yamlTarget,
      pathInRepo: persisted.pathInRepo,
      manualAs: explicitAs,
      explicitName: nameOverride !== '',
      dryRun,
      sourceType,
      contentRoot,
      forceFreshMaterialize: forceFreshMaterialize,
      originalRef,
      acceptedElevated,
    });
    // A re-install can update a pack under its existing name.
    installed = buildInstalledList(selected, packName);
    if (dryRun) {
      logger.info(
        `[dry-run] Would install pack "${packName}" to ${scope === 'global' ? '~/.agentsmesh/packs/.' : '.agentsmesh/packs/.'}`,
      );
      return { installed, skipped };
    }
  }
  await runPostOperationGenerate('install', scope, context.rootBase);
  return { installed, skipped };
}
