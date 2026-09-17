/**
 * Choose manual, skill-pack, or native install discovery.
 *
 * Dispatch precedence:
 *   1. Explicit `--as <kind>`          → manual importer (classifier bypassed).
 *   2. Explicit `--target <id>`        → native importer (classifier bypassed).
 *   3. Layout-based detection:
 *      - `canonical` set              → existing native/slice path.
 *      - `skillPack` set              → aggregator → CanonicalFiles + extras.
 *      - otherwise                    → existing native/slice path + discarded hint.
 */
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { resolveManualDiscoveredForInstall } from '../manual/manual-install-discovery.js';
import { resolveDiscoveredForInstall } from '../run/run-install-discovery.js';
import { detectLayout } from '../classify/layout-detect.js';
import { inferMdcTarget } from '../manual/mdc-target-infer.js';
import { aggregateAnthropicSkillPack } from '../../sources/anthropic-skill-pack/aggregate.js';
import { parseSkillDirectory } from '../../canonical/features/skills.js';
import { featuresFromCanonical } from './discover-resources.js';
import type { CanonicalRule } from '../../core/canonical-types.js';
import type { ExtendPick } from '../../config/core/schema.js';
import type { ManualInstallAs } from '../manual/manual-install-mode.js';
import type { SourceLayout, FlatCollection } from '../classify/layout-types.js';
import type { AggregateResult } from '../../sources/anthropic-skill-pack/aggregate.js';
import type { CanonicalFiles } from '../../core/types.js';
import type { ParseFrontmatterOptions } from '../../canonical/features/rules.js';

export interface InstallDiscoveryPrep {
  readonly yamlTarget?: string;
  readonly scopedFeatures?: string[];
  readonly cleanup?: () => Promise<void>;
}

export interface InstallDiscoveryResult {
  prep: InstallDiscoveryPrep;
  implicitPick: ExtendPick | undefined;
  narrowed: CanonicalFiles;
  discoveredFeatures: string[];
  layout?: SourceLayout;
  /** Present only for skill-pack path; carries broken-links + dedups. */
  aggregate?: AggregateResult;
}

function aggregateToCanonical(aggregate: AggregateResult): CanonicalFiles {
  return {
    rules: [...aggregate.rules],
    commands: [...aggregate.commands],
    agents: [...aggregate.agents],
    skills: [...aggregate.skills],
    mcp: null,
    permissions: null,
    hooks: null,
    ignore: [],
  };
}

async function enrichMdcTargets(
  contentRoot: string,
  collections: readonly FlatCollection[],
): Promise<FlatCollection[]> {
  const out: FlatCollection[] = [];
  for (const c of collections) {
    if (c.fileShape === 'mdc' && !c.inferredTarget) {
      const target = await inferMdcTarget(join(contentRoot, c.path));
      out.push(target ? { ...c, inferredTarget: target } : c);
    } else {
      out.push(c);
    }
  }
  return out;
}

/** Map a SourceLayout to the legacy sourceType string for install manifests. */
export function deriveSourceType(layout: SourceLayout): string {
  if (layout.canonical) return 'canonical-agentsmesh';
  if (layout.skillPack) return 'anthropic-skill-pack';
  if (layout.rootSkill) return 'anthropic-skill-pack';
  if (layout.rootRule) return 'tool-native';
  if (layout.toolNativeManifests.length > 0) return 'tool-native';
  return 'unknown';
}

async function rootSkillToCanonical(
  contentRoot: string,
  parseOpts: ParseFrontmatterOptions,
): Promise<CanonicalFiles> {
  const skill = await parseSkillDirectory(contentRoot, parseOpts);
  return {
    rules: [],
    commands: [],
    agents: [],
    skills: skill ? [skill] : [],
    mcp: null,
    permissions: null,
    hooks: null,
    ignore: [],
  };
}

async function rootRuleToCanonical(
  contentRoot: string,
  rootRulePath: string,
): Promise<CanonicalFiles> {
  const absPath = join(contentRoot, rootRulePath);
  const body = await readFile(absPath, 'utf-8').catch(() => '');
  // Validation requires a non-empty description. Legacy `.cursorrules` /
  // `.windsurfrules` files don't carry frontmatter, so synthesize a stable
  // description that documents the file's origin and survives dry-run filters.
  const description = `Imported from ${rootRulePath}`;
  const rule: CanonicalRule = {
    source: absPath,
    root: true,
    targets: [],
    description,
    globs: [],
    body,
  };
  return {
    rules: body ? [rule] : [],
    commands: [],
    agents: [],
    skills: [],
    mcp: null,
    permissions: null,
    hooks: null,
    ignore: [],
  };
}

export async function resolveInstallDiscovery(args: {
  resolvedPath: string;
  contentRoot: string;
  pathInRepo: string;
  explicitTarget?: string;
  explicitAs?: ManualInstallAs;
  replayPick?: ExtendPick;
  parseOpts?: ParseFrontmatterOptions;
}): Promise<InstallDiscoveryResult> {
  const parseOpts = args.parseOpts ?? {};

  if (args.explicitAs) {
    const manual = await resolveManualDiscoveredForInstall(
      args.contentRoot,
      args.explicitAs,
      args.explicitTarget,
      args.replayPick,
      parseOpts,
    );
    return { implicitPick: undefined, ...manual };
  }

  if (args.explicitTarget) {
    return resolveDiscoveredForInstall(
      args.resolvedPath,
      args.contentRoot,
      args.pathInRepo,
      args.explicitTarget,
      parseOpts,
    );
  }

  const rawLayout = await detectLayout(args.contentRoot);
  const enrichedCollections = await enrichMdcTargets(args.contentRoot, rawLayout.flatCollections);
  const layout: SourceLayout = { ...rawLayout, flatCollections: enrichedCollections };

  if (layout.skillPack && !layout.canonical) {
    const aggregate = await aggregateAnthropicSkillPack(args.contentRoot, parseOpts);
    const narrowed = aggregateToCanonical(aggregate);
    return {
      prep: { cleanup: aggregate.cleanup },
      implicitPick: undefined,
      narrowed,
      discoveredFeatures: featuresFromCanonical(narrowed),
      layout,
      aggregate,
    };
  }

  if (layout.rootSkill && !layout.canonical && !layout.skillPack) {
    const narrowed = await rootSkillToCanonical(args.contentRoot, parseOpts);
    return {
      prep: {},
      implicitPick: undefined,
      narrowed,
      discoveredFeatures: featuresFromCanonical(narrowed),
      layout,
    };
  }

  if (
    layout.rootRule &&
    !layout.canonical &&
    !layout.skillPack &&
    !layout.rootSkill &&
    layout.flatCollections.length === 0
  ) {
    const narrowed = await rootRuleToCanonical(args.contentRoot, layout.rootRule.path);
    return {
      prep: {},
      implicitPick: undefined,
      narrowed,
      discoveredFeatures: featuresFromCanonical(narrowed),
      layout,
    };
  }

  if (layout.subPacks.length > 0) {
    return {
      prep: {},
      implicitPick: undefined,
      narrowed: {
        rules: [],
        commands: [],
        agents: [],
        skills: [],
        mcp: null,
        permissions: null,
        hooks: null,
        ignore: [],
      },
      discoveredFeatures: [],
      layout,
    };
  }

  // Flat collections (e.g. rules/*.mdc, commands/*.md) have no canonical or
  // skill-pack hint, but the picker can auto-pick a single collection and
  // recurse with explicit --as / --path. Surface the layout instead of letting
  // the native fallback throw "No installable resources" before the picker runs.
  if (layout.flatCollections.length > 0) {
    return {
      prep: {},
      implicitPick: undefined,
      narrowed: {
        rules: [],
        commands: [],
        agents: [],
        skills: [],
        mcp: null,
        permissions: null,
        hooks: null,
        ignore: [],
      },
      discoveredFeatures: [],
      layout,
    };
  }

  const native = await resolveDiscoveredForInstall(
    args.resolvedPath,
    args.contentRoot,
    args.pathInRepo,
    args.explicitTarget,
    parseOpts,
  );
  return { ...native, layout };
}
