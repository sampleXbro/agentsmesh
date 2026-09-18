/**
 * `~/.warp/settings.toml` document handling for the `[agents.profiles]`
 * permission keys. The mapping itself lives in `permissions-format.ts`; this
 * module only reads and rewrites the TOML around it.
 */

import { isRecord } from '../../utils/types/guards.js';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import type { Permissions } from '../../core/types.js';
import {
  OWNED_PROFILE_KEYS,
  buildWarpAgentProfile,
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
  return (
    Object.keys(profile).length === 1 &&
    (profile.agent_mode_command_execution_allowlist?.length ?? 0) === 0
  );
}

/**
 * Merge canonical permissions into an existing `settings.toml`: the four owned
 * keys are replaced (or removed), every other key survives — this is the user's
 * own settings file, not an agentsmesh artifact. `null` means "leave the file
 * alone": canonical says nothing and no owned key is on disk to clear, so a
 * blank `permissions.yaml` never overrides Warp's own defaults.
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
  const ownsKeyOnDisk = OWNED_PROFILE_KEYS.some((key) => key in profiles);
  if (isEmptyProjection(profile) && !ownsKeyOnDisk) return null;

  for (const key of OWNED_PROFILE_KEYS) delete profiles[key];
  agents.profiles = { ...profiles, ...profile };
  return stringifyToml({ ...root, agents }).trimEnd() + '\n';
}

export function parseWarpPermissions(content: string): Permissions | null {
  const agents = parseTomlObject(content).agents;
  const profiles = isRecord(agents) ? agents.profiles : undefined;
  if (!isRecord(profiles)) return null;
  return profileToPermissions(profiles);
}
