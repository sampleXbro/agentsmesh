/**
 * Apply saved install manifest scope when replaying `install --sync`.
 */

import type { ValidatedConfig } from '../../config/core/schema.js';
import type { CanonicalFiles } from '../../core/types.js';
import { featuresFromCanonical } from '../core/discover-resources.js';
import { narrowDiscoveredForInstallScope } from '../core/resource-selection.js';

export interface InstallReplayScope {
  features?: ValidatedConfig['features'];
  pick?: NonNullable<ValidatedConfig['extends'][number]['pick']>;
  /**
   * The user's original ref expression (e.g. `main`) as recorded in the prior
   * installs.yaml entry. Bridges (refresh, sync) thread this through so a
   * re-install from a SHA-pinned source does not clobber a branch/tag pin with
   * the resolved SHA — which would freeze the pin and break future refreshes.
   */
  originalRef?: string;
  /**
   * Elevated-artifact consent recorded in the prior installs.yaml entry.
   * Bridges replay it so a deterministic re-clone re-applies the same
   * `--accept-*` decisions automatically, keeping pack contents in sync with
   * the recorded `features` instead of silently stripping them.
   */
  acceptedElevated?: ('hooks' | 'permissions' | 'mcp')[];
}

/**
 * The source paths a replay re-installs, in order. A marketplace pack records
 * one path per sub-pack (`paths`); every other pack one `path` or none.
 */
export function replayPaths(entry: {
  readonly path?: string;
  readonly paths?: readonly string[];
}): Array<string | undefined> {
  return entry.paths !== undefined && entry.paths.length > 0 ? [...entry.paths] : [entry.path];
}

export function applyReplayInstallScope(
  narrowed: CanonicalFiles,
  discoveredFeatures: string[],
  replay?: InstallReplayScope,
): { narrowed: CanonicalFiles; discoveredFeatures: string[] } {
  if (!replay?.features && !replay?.pick) {
    return { narrowed, discoveredFeatures };
  }
  const replayNarrowed = narrowDiscoveredForInstallScope(narrowed, {
    scopedFeatures: replay.features,
    implicitPick: replay.pick,
  });
  return {
    narrowed: replayNarrowed,
    discoveredFeatures: featuresFromCanonical(replayNarrowed),
  };
}
