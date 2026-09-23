import type { ExtendPick, ValidatedConfig } from '../../config/core/schema.js';
import { loadCanonicalWithExtends } from '../../canonical/extends/extends.js';
import type { CanonicalFiles } from '../../core/types.js';
import { logger } from '../../utils/output/logger.js';
import { stripUntrustedElevatedArtifacts } from '../core/elevated-artifacts.js';
import { resolveInstallConflicts } from '../core/install-conflicts.js';
import {
  buildInstallPick,
  deriveInstallFeatures,
  ensureInstallSelection,
  pickForSelectedResources,
} from '../core/install-entry-selection.js';
import { readInstallManifest } from '../core/install-manifest.js';
import { selectInstallEntryName } from '../core/install-name.js';
import { pickReuseEntryName } from '../core/pick-reuse-entry-name.js';
import {
  hasInstallableResources,
  resolveAgentPool,
  resolveCommandPool,
  resolveRulePool,
  resolveSkillPool,
} from '../core/pool-resolution.js';
import { ruleSlug } from '../core/validate-resources.js';
import { featuresAfterStrip, resolveElevatedConsent } from './elevated-consent-replay.js';
import { applyReplayInstallScope } from './install-replay.js';
import type { RunInstallExecuteArgs } from './run-install-execute.js';
import { buildSkippedList } from './run-install-result.js';

/**
 * The selection half of an install: gate elevated artifacts, resolve the
 * resource pools, settle conflicts, then derive the features, pick and entry
 * name. Split from run-install-execute.ts, which writes the result.
 */
export interface InstallSelection {
  readonly consent: ReturnType<typeof resolveElevatedConsent>;
  /** The canonical content left after the consent gate and the replay scope. */
  readonly narrowed: CanonicalFiles;
  readonly selected: Awaited<ReturnType<typeof resolveInstallConflicts>>;
  readonly skipped: ReturnType<typeof buildSkippedList>;
  readonly entryFeatures: ValidatedConfig['features'];
  readonly pick: ExtendPick | undefined;
  readonly entryName: string;
}

export async function selectInstall(args: RunInstallExecuteArgs): Promise<InstallSelection> {
  const { force, dryRun, tty, nameOverride, explicitAs, config, context, parsed } = args;
  const { pathInRepo, persisted, replay, prep, implicitPick, narrowed, discoveredFeatures } = args;

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
  const skipped = buildSkippedList(skillsPool, rulesPool, commandsPool, agentsPool, selected);
  return {
    consent,
    narrowed: effectiveNarrowed,
    selected,
    skipped,
    entryFeatures,
    pick,
    entryName,
  };
}
