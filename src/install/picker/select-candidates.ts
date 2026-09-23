/**
 * Single chokepoint where layout ambiguity becomes install intent.
 *
 * Consumes a `SourceLayout` and CLI flags, produces `InstallTarget[]`
 * — one entry per concrete install row that will be written to
 * `installs.yaml`. When the result is empty, the caller falls through
 * to the existing discovery path (canonical or skill-pack).
 */

import type { SourceLayout, FlatCollection, SubPack } from '../classify/layout-types.js';
import type { InstallTarget, CanonicalFeature } from '../core/install-target.js';
import type { ManualInstallAs } from '../manual/manual-install-mode.js';

export interface SelectCandidatesOpts {
  layout: SourceLayout;
  sourceName: string;
  sourceForYaml: string;
  explicitPath?: string;
  explicitAs?: ManualInstallAs;
  explicitTarget?: string;
  all?: boolean;
  force?: boolean;
  tty?: boolean;
}

export interface SelectCandidatesResult {
  targets: InstallTarget[];
  isMarketplace: boolean;
}

function featuresFromLayout(layout: {
  skillPack: unknown;
  rootSkill?: unknown;
  flatCollections: readonly FlatCollection[];
}): CanonicalFeature[] {
  const features = new Set<CanonicalFeature>();
  if (layout.skillPack) features.add('skills');
  if (layout.rootSkill) features.add('skills');
  for (const c of layout.flatCollections) features.add(c.suggestedAs);
  return [...features];
}

function subPackSlug(path: string): string {
  return path
    .replace(/[/\\]+/g, '-')
    .replace(/[^a-z0-9-]/gi, '')
    .toLowerCase();
}

function targetFromSubPack(sp: SubPack, sourceName: string, sourceForYaml: string): InstallTarget {
  const features = featuresFromLayout(sp.layout);
  // Only forward `as` for flat-collection sub-packs. Skill-pack sub-packs
  // (`skills/<name>/SKILL.md`) and root-skill sub-packs (`SKILL.md` at the
  // sub-pack root) need the auto-discovery path; `--as skills` would route
  // them through the manual single-skill installer, which expects a single
  // SKILL.md directory and fails on `skills/<name>/...` subtrees.
  const useManualAs = !sp.layout.skillPack && !sp.layout.rootSkill && features.length > 0;
  return {
    name: `${sourceName}-${subPackSlug(sp.path)}`,
    source: sourceForYaml,
    path: sp.path,
    ...(useManualAs ? { as: features[0] } : {}),
    features,
  };
}

function targetFromCollection(
  c: FlatCollection,
  sourceName: string,
  sourceForYaml: string,
): InstallTarget {
  return {
    name: sourceName,
    source: sourceForYaml,
    path: c.path,
    as: c.suggestedAs,
    target: c.inferredTarget,
    features: [c.suggestedAs],
  };
}

export function selectInstallCandidates(opts: SelectCandidatesOpts): SelectCandidatesResult {
  const { layout, sourceName, sourceForYaml, explicitPath, explicitAs, explicitTarget } = opts;

  if (explicitPath || explicitAs || explicitTarget) {
    return { targets: [], isMarketplace: false };
  }

  if (layout.canonical || layout.skillPack) {
    return { targets: [], isMarketplace: false };
  }

  // Any sub-packs trigger the marketplace path. The directory-heuristic
  // detector (`detectSubPacks`) already enforces a `>= 2` minimum to avoid
  // false positives, but `.claude-plugin/marketplace.json` is allowed to
  // declare a singleton plugin — those should still be installable here.
  if (layout.subPacks.length >= 1) {
    return selectMarketplace(opts);
  }

  if (layout.flatCollections.length === 1) {
    const col = layout.flatCollections[0]!;
    const target = targetFromCollection(col, sourceName, sourceForYaml);
    return { targets: [target], isMarketplace: false };
  }

  if (layout.flatCollections.length > 1) {
    return selectMultipleCollections(opts);
  }

  return { targets: [], isMarketplace: false };
}

function selectMarketplace(opts: SelectCandidatesOpts): SelectCandidatesResult {
  const { layout, sourceName, sourceForYaml } = opts;

  if (opts.all) {
    const targets = layout.subPacks.map((sp) => targetFromSubPack(sp, sourceName, sourceForYaml));
    return { targets, isMarketplace: true };
  }

  if (opts.force || !opts.tty) {
    const candidates = layout.subPacks.map((sp) => ({
      path: sp.path,
      features: featuresFromLayout(sp.layout),
    }));
    const listing = candidates.map((c) => `  - ${c.path} (${c.features.join(', ')})`).join('\n');
    throw new Error(
      `Marketplace source with ${layout.subPacks.length} sub-packs. ` +
        `Pass --all to install all, or use --path <subpath>:\n${listing}`,
    );
  }

  const targets = layout.subPacks.map((sp) => targetFromSubPack(sp, sourceName, sourceForYaml));
  return { targets, isMarketplace: true };
}

function selectMultipleCollections(opts: SelectCandidatesOpts): SelectCandidatesResult {
  const { layout, sourceName, sourceForYaml } = opts;

  if (opts.force || !opts.tty) {
    const listing = layout.flatCollections
      .map((c) => `  - ${c.path} (${c.suggestedAs}, .${c.fileShape})`)
      .join('\n');
    throw new Error(
      `Ambiguous source with ${layout.flatCollections.length} resource collections. ` +
        `Pass --as <kind> to select, or --path <subpath>:\n${listing}`,
    );
  }

  const targets = layout.flatCollections.map((c) =>
    targetFromCollection(c, sourceName, sourceForYaml),
  );
  return { targets, isMarketplace: false };
}
