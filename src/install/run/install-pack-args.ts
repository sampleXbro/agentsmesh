/**
 * Arguments and pure helpers of `installAsPack` (split from run-install-pack.ts
 * for the 200-line limit).
 */

import type { ExtendPick } from '../../config/core/schema.js';
import type { CanonicalFiles } from '../../core/types.js';
import { ruleSlug } from '../core/validate-resources.js';
import type { ManualInstallAs } from '../manual/manual-install-mode.js';
import type { PackMetadata } from '../pack/pack-schema.js';

export interface InstallAsPackArgs {
  canonicalDir: string;
  packName: string;
  narrowed: CanonicalFiles;
  selected: {
    skillNames: string[];
    ruleSlugs: string[];
    commandNames: string[];
    agentNames: string[];
  };
  sourceForYaml: string;
  version?: string;
  sourceKind: PackMetadata['source_kind'];
  entryFeatures: PackMetadata['features'];
  pick: ExtendPick | undefined;
  yamlTarget?: string;
  pathInRepo?: string;
  manualAs?: ManualInstallAs;
  /** The user passed `--name`: address that pack; a collision names the flag. */
  explicitName?: boolean;
  /** Resolve the pack and check its name, but write nothing. */
  dryRun?: boolean;
  /** Classifier verdict that drove this install; written to `.agentsmesh-install-manifest.json`. */
  sourceType?: string;
  /**
   * Upstream source root from which `narrowed` was discovered. Used to
   * harvest top-level preserved-boilerplate files (README/LICENSE/…) into the
   * pack root. Optional — when omitted, no preserved files are copied.
   */
  contentRoot?: string;
  /**
   * When true, skip the `findExistingPack` merge path and force a full
   * materialize of the new content. Used by `agentsmesh refresh` to replace
   * a pack's contents with a fresh ref rather than merging into the existing
   * pack. When omitted or false, existing merge behavior is preserved.
   */
  forceFreshMaterialize?: boolean;
  /**
   * The user's original ref expression (e.g. `main`, `v1.2.3`) before it was
   * resolved to a pinned SHA. Stored in `installs.yaml` as `original_ref` so
   * the refresh planner can re-resolve branch/tag pins against the remote
   * rather than re-resolving the already-pinned SHA to itself.
   */
  originalRef?: string;
  /**
   * Elevated artifacts the user consented to at install time. Persisted to
   * `installs.yaml` so the sync/refresh bridges re-apply the same consent when
   * they replay this install, keeping pack contents in sync with `features`.
   */
  acceptedElevated?: ('hooks' | 'permissions' | 'mcp')[];
}

export function pathScope(pathInRepo?: string): Pick<PackMetadata, 'path' | 'paths'> {
  if (!pathInRepo) {
    return { path: undefined, paths: undefined };
  }
  return { path: pathInRepo, paths: undefined };
}

export function applySelection(
  canonical: CanonicalFiles,
  selected: InstallAsPackArgs['selected'],
): CanonicalFiles {
  const skillSet = new Set(selected.skillNames);
  const ruleSlugSet = new Set(selected.ruleSlugs);
  const cmdSet = new Set(selected.commandNames);
  const agentSet = new Set(selected.agentNames);
  return {
    ...canonical,
    skills: canonical.skills.filter((s) => skillSet.has(s.name)),
    rules: canonical.rules.filter((r) => ruleSlugSet.has(ruleSlug(r))),
    commands: canonical.commands.filter((c) => cmdSet.has(c.name)),
    agents: canonical.agents.filter((a) => agentSet.has(a.name)),
  };
}
