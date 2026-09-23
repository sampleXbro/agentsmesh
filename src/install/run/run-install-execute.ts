import type { ValidatedConfig } from '../../config/core/schema.js';
import { loadCanonicalWithExtends } from '../../canonical/extends/extends.js';
import { logger } from '../../utils/output/logger.js';
import { runPostOperationGenerate } from './post-install-generate.js';
import {
  hasInstallableResources,
  resolveAgentPool,
  resolveCommandPool,
  resolveRulePool,
  resolveSkillPool,
} from '../core/pool-resolution.js';
import { resolveInstallConflicts } from '../core/install-conflicts.js';
import {
  buildInstallPick,
  deriveInstallFeatures,
  ensureInstallSelection,
  pickForSelectedResources,
} from '../core/install-entry-selection.js';
import { ruleSlug } from '../core/validate-resources.js';
import { writeInstallAsExtend } from '../core/install-extend-entry.js';
import { installAsPack } from './run-install-pack.js';
import { selectInstallEntryName } from '../core/install-name.js';
import { readInstallManifest } from '../core/install-manifest.js';
import { pickReuseEntryName } from '../core/pick-reuse-entry-name.js';
import { applyReplayInstallScope, type InstallReplayScope } from './install-replay.js';
import { buildInstalledList, buildSkippedList } from './run-install-result.js';
import type { ParsedInstallSource } from '../source/parse-install-source.js';
import type { ManualInstallPersistence } from '../manual/manual-install-persistence.js';
import type { ManualInstallAs } from '../manual/manual-install-mode.js';
import type { ExtendPick } from '../../config/core/schema.js';
import type { CanonicalFiles } from '../../core/types.js';
import type { InstallDiscoveryPrep } from '../core/install-discovery.js';
import { stripUntrustedElevatedArtifacts } from '../core/elevated-artifacts.js';
import {
  consentedArtifactsForManifest,
  featuresAfterStrip,
  resolveElevatedConsent,
  resolveOriginalRef,
} from './elevated-consent-replay.js';

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

export async function executeRunInstallPoolsAndWrite(
  args: RunInstallExecuteArgs,
): Promise<InstallExecuteResult> {
  const { scope, force, dryRun, tty, useExtends, forceFreshMaterialize, nameOverride, explicitAs } =
    args;
  const { config, context, parsed, sourceForYaml, version, pathInRepo, contentRoot, persisted } =
    args;
  const { replay, prep, implicitPick, narrowed, discoveredFeatures, sourceType } = args;

  // Replayed consent (from a prior installs.yaml entry, via the sync/refresh
  // bridges) re-applies the user's original `--accept-*` decisions so a
  // deterministic re-clone does not strip artifacts the user already trusted.
  const consent = resolveElevatedConsent(
    {
      acceptHooks: args.acceptHooks,
      acceptPermissions: args.acceptPermissions,
      acceptMcp: args.acceptMcp,
    },
    replay,
  );

  // Consent gate: strip elevated artifacts (hooks/permissions/mcp) from any
  // non-local source unless the user explicitly opted in. Done BEFORE pool
  // resolution so the bytes never reach the pack on disk.
  const gated = stripUntrustedElevatedArtifacts(narrowed, {
    sourceKind: parsed.kind,
    ...consent,
  });
  if (gated.stripped.length > 0) {
    logger.warn(
      `[agentsmesh] Stripped ${gated.stripped.join(', ')} from untrusted ${parsed.kind} source.\n` +
        `  These artifacts control your tool settings (shell hooks, granted permissions, MCP launch specs).\n` +
        `  To accept them explicitly, re-run with: ${gated.stripped
          .map((a) => `--accept-${a}`)
          .join(' ')} (or --accept-elevated for all three).`,
    );
  }

  // Stripped elevated artifacts must also drop out of the recorded `features`,
  // otherwise installs.yaml/pack.yaml claim hooks/permissions/mcp the pack does
  // not actually contain (metadata/content desync).
  const { narrowed: effectiveNarrowed, discoveredFeatures: effectiveFeatures } =
    applyReplayInstallScope(
      gated.canonical,
      featuresAfterStrip(discoveredFeatures, gated.stripped),
      replay,
    );
  if (!hasInstallableResources(effectiveNarrowed)) {
    throw new Error(
      implicitPick || prep.scopedFeatures
        ? 'No resources match the install path or implicit selection (check pick names exist at that path).'
        : 'No supported resources found to install (skills, rules, commands, agents).',
    );
  }
  const skillsPool = await resolveSkillPool(effectiveNarrowed, force, dryRun, tty);
  const rulesPool = await resolveRulePool(effectiveNarrowed, force, dryRun, tty);
  const commandsPool = await resolveCommandPool(effectiveNarrowed, force, dryRun, tty);
  const agentsPool = await resolveAgentPool(effectiveNarrowed, force, dryRun, tty);
  const preConflict = {
    skills: skillsPool.length,
    rules: rulesPool.length,
    commands: commandsPool.length,
    agents: agentsPool.length,
  };
  const { canonical: merged } = await loadCanonicalWithExtends(
    config,
    context.configDir,
    {},
    context.canonicalDir,
  );
  const selected =
    !force && !dryRun && tty
      ? await resolveInstallConflicts(merged, {
          skills: skillsPool,
          rules: rulesPool,
          commands: commandsPool,
          agents: agentsPool,
        })
      : {
          skillNames: skillsPool.map((s) => s.name),
          ruleSlugs: rulesPool.map((r) => ruleSlug(r)),
          commandNames: commandsPool.map((c) => c.name),
          agentNames: agentsPool.map((a) => a.name),
        };
  ensureInstallSelection({ selected, discoveredFeatures: effectiveFeatures, preConflict });
  const entryFeatures = (replay?.features ??
    deriveInstallFeatures(effectiveFeatures, selected)) as ValidatedConfig['features'];
  if (entryFeatures.length === 0) {
    throw new Error('No features left to install after selection.');
  }
  const pick =
    pickForSelectedResources(replay?.pick, selected) ??
    persisted.pick ??
    buildInstallPick({
      pathInRepo: persisted.pathInRepo ?? pathInRepo,
      implicitPick,
      preConflictCounts: preConflict,
      selected,
    });
  const installManifest = await readInstallManifest(context.canonicalDir);
  const reuseExistingName = pickReuseEntryName({
    manifest: installManifest,
    parsed,
    entryFeatures,
    yamlTarget: prep.yamlTarget,
    explicitAs,
  });
  const entryName = selectInstallEntryName({
    config,
    parsed,
    entryFeatures,
    nameOverride: nameOverride || '',
    reuseExistingName: reuseExistingName || '',
  });

  let installed = buildInstalledList(selected, entryName);
  const skipped = buildSkippedList(skillsPool, rulesPool, commandsPool, agentsPool, selected);

  const originalRef = resolveOriginalRef(parsed, replay);
  const acceptedElevated = consentedArtifactsForManifest(effectiveNarrowed, consent);

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
      narrowed: effectiveNarrowed,
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
