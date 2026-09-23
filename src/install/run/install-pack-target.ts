/**
 * Which existing pack an install updates, and how.
 *
 * - Same source, target, `as` and feature set: that pack (merge, as always).
 * - An explicit `--name` of a pack from the same source, target and `as`:
 *   that pack, even when the feature set changed (the source dropped a folder).
 * - No `--name`, and the install covers the whole source (no pick, no path):
 *   the one whole-source pack from the same source, target and `as`.
 *
 * Packs split on purpose (a picked subset, a path, another `--as`) are never
 * folded together. A whole-source install onto a whole-source pack replaces
 * its contents, like `refresh`, so resources removed upstream go away.
 */

import type { ExtendPick } from '../../config/core/schema.js';
import type { PackMetadata } from '../pack/pack-schema.js';
import { findExistingPack, findPacksBySource, type FoundPack } from '../pack/pack-reader.js';

export interface InstallPackTarget {
  readonly found: FoundPack;
  /** Replace the pack's contents instead of merging into them. */
  readonly replace: boolean;
}

export interface ResolveInstallPackArgs {
  readonly packsDir: string;
  readonly source: string;
  readonly packName: string;
  readonly explicitName: boolean;
  readonly target: PackMetadata['target'];
  readonly as: PackMetadata['as'];
  readonly features: PackMetadata['features'];
  readonly pick: ExtendPick | undefined;
  readonly pathInRepo: string | undefined;
}

/** A pack (or an install) that covers its whole source: no pick, no path. */
export function coversWholeSource(scope: {
  readonly pick?: ExtendPick;
  readonly path?: string;
  readonly paths?: readonly string[];
}): boolean {
  return scope.pick === undefined && !scope.path && (scope.paths?.length ?? 0) === 0;
}

export async function resolveInstallPack(
  args: ResolveInstallPackArgs,
): Promise<InstallPackTarget | null> {
  const wholeSource = coversWholeSource({ pick: args.pick, path: args.pathInRepo });
  const withReplace = (found: FoundPack): InstallPackTarget => ({
    found,
    replace: wholeSource && coversWholeSource(found.meta),
  });
  const scope = { target: args.target, as: args.as };
  const exact = await findExistingPack(args.packsDir, args.source, {
    ...scope,
    features: args.features,
  });
  if (exact) return withReplace(exact);
  const sameSource = await findPacksBySource(args.packsDir, args.source, scope);
  if (args.explicitName) {
    const named = sameSource.find((p) => p.name === args.packName);
    return named ? withReplace(named) : null;
  }
  if (!wholeSource) return null;
  const whole = sameSource.filter((p) => coversWholeSource(p.meta));
  return whole.length === 1 ? withReplace(whole[0]!) : null;
}

/** Why a new pack cannot take `packName`: another pack already holds it. */
export function packNameCollision(packName: string, explicitName: boolean): Error {
  return new Error(
    explicitName
      ? `A pack named "${packName}" already exists from another source or with another --as/--target. ` +
          'Choose a different --name, or uninstall that pack first.'
      : `Auto-generated pack name "${packName}" collides with an existing incompatible pack. ` +
          'Use --name to choose a different pack name.',
  );
}
