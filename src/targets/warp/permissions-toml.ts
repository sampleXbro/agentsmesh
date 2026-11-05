/**
 * `~/.warp/settings.toml` document handling for the `[agents.profiles]`
 * permission keys. The mapping itself lives in `permissions-format.ts`; this
 * module only reads and rewrites the TOML around it.
 */

import { isRecord } from '../../utils/types/guards.js';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import type { Permissions } from '../../core/types.js';
import {
  buildWarpAgentProfile,
  ownedProfileKeys,
  profileToPermissions,
  type WarpAgentProfile,
} from './permissions-format.js';

function parseTomlObject(content: string | null): Record<string, unknown> {
  if (content === null) return {};
  try {
    const parsed: unknown = parseToml(content);
    if (isRecord(parsed)) return parsed;
  } catch {
    // Unparsable user settings: fall back to a fresh document.
  }
  return {};
}

function tableCopy(root: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = root[key];
  return isRecord(value) ? { ...value } : {};
}

/** Nothing to say: no command, read or mode key carries canonical content. */
function isEmptyProjection(profile: WarpAgentProfile): boolean {
  return Object.values(profile).every((value) => Array.isArray(value) && value.length === 0);
}

/**
 * Merge canonical permissions into an existing `settings.toml`: the owned keys
 * of each managed list are replaced (or removed), every other key survives —
 * this is the user's own settings file, not an agentsmesh artifact. Keys of a
 * list permissions.yaml does not manage stay the user's. `null` means "leave
 * the file alone": canonical says nothing and no owned key is on disk to clear,
 * so an empty list never overrides Warp's own defaults.
 */
export function serializeWarpSettings(
  permissions: Permissions | null,
  existingContent: string | null,
): string | null {
  const profile = buildWarpAgentProfile(permissions);
  if (!profile) return null;

  const root = parseTomlObject(existingContent);
  const agents = tableCopy(root, 'agents');
  const profiles = tableCopy(agents, 'profiles');
  const ownedKeys = ownedProfileKeys(permissions);
  const ownsKeyOnDisk = ownedKeys.some((key) => key in profiles);
  if (isEmptyProjection(profile) && !ownsKeyOnDisk) return null;

  for (const key of ownedKeys) delete profiles[key];
  agents.profiles = { ...profiles, ...profile };
  return stringifyToml({ ...root, agents }).trimEnd() + '\n';
}

export function parseWarpPermissions(content: string): Permissions | null {
  const agents = parseTomlObject(content).agents;
  const profiles = isRecord(agents) ? agents.profiles : undefined;
  if (!isRecord(profiles)) return null;
  return profileToPermissions(profiles);
}
