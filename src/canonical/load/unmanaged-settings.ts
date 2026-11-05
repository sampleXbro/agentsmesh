/**
 * Packs and extends only add MCP servers, permission lists, hooks and ignore
 * patterns to settings the user's own canonical files manage. Anything else
 * would replace what is already in each tool, so it is dropped with a warning.
 */

import { PERMISSION_LISTS } from '../../core/permissions.js';
import type { CanonicalFiles, Hooks, Permissions } from '../../core/types.js';

export type SettingsFeature = 'mcp' | 'permissions' | 'hooks' | 'ignore';

export interface SkippedSettings {
  readonly feature: SettingsFeature;
  readonly items: readonly string[];
}

const SETTINGS_FEATURES: readonly SettingsFeature[] = ['mcp', 'permissions', 'hooks', 'ignore'];

const IMPORT_HINT = 'run "agentsmesh import --from <tool>" (add --global for ~/.agentsmesh)';

interface Wording {
  readonly what: string;
  readonly reason: string;
  readonly kept: string;
  readonly add: string;
  readonly copied: string;
}

const WORDING: Record<SettingsFeature, Wording> = {
  mcp: {
    what: 'MCP servers',
    reason: 'Your own mcp.json has no "mcpServers" key',
    kept: 'their own servers',
    add: 'list your servers under "mcpServers" in mcp.json',
    copied: 'servers',
  },
  permissions: {
    what: 'permissions',
    reason: 'Your own permissions.yaml does not manage these lists (missing or commented out)',
    kept: 'their own lists',
    add: 'add the list to permissions.yaml (an empty list is fine)',
    copied: 'lists',
  },
  hooks: {
    what: 'hooks',
    reason: 'Your own hooks.yaml is missing or has only comments',
    kept: 'their own hooks',
    add: 'write your hooks in hooks.yaml ("{}" if you have none)',
    copied: 'hooks',
  },
  ignore: {
    what: 'ignore patterns',
    reason:
      'Your own ignore file (.agentsmesh/ignore, or ~/.agentsmesh/ignore with --global) has no patterns',
    kept: 'their own ignore files',
    add: 'add the patterns you want to your own ignore file',
    copied: 'patterns',
  },
};

// Say that a file AgentsMesh wrote only from these values goes away: stale
// cleanup removes it, which for ignore files can expose a secret it hid.
export function unmanagedSettingsMessage(skipped: SkippedSettings): string {
  const w = WORDING[skipped.feature];
  return (
    `[agentsmesh] Skipped ${w.what} from installed packs or extends: ${skipped.items.join(', ')}. ` +
    `${w.reason}, so AgentsMesh does not write them to your tools: your tools keep ${w.kept}, ` +
    'and a file AgentsMesh wrote only from them is removed. ' +
    `To use them, ${w.add}, or ${IMPORT_HINT} to copy in the ${w.copied} your tools already have, then generate again.`
  );
}

/** Only the lists the local file manages; a pack's other lists are dropped. */
function managedPermissions(
  merged: Permissions | null,
  local: Permissions | null,
): Permissions | null {
  if (merged === null || local === null) return null;
  const kept: Permissions = {};
  for (const list of PERMISSION_LISTS) {
    if (local[list] !== undefined) kept[list] = merged[list] ?? [];
  }
  return kept;
}

function hookItems(hooks: Hooks | null): string[] {
  return Object.entries(hooks ?? {}).flatMap(([event, entries = []]) =>
    entries.length === 0
      ? []
      : [`${event} (${entries.length} hook${entries.length === 1 ? '' : 's'})`],
  );
}

function skippedItems(
  feature: SettingsFeature,
  merged: CanonicalFiles,
  local: CanonicalFiles,
): string[] {
  if (feature === 'mcp') {
    return local.mcp === null ? Object.keys(merged.mcp?.mcpServers ?? {}) : [];
  }
  if (feature === 'permissions') {
    return PERMISSION_LISTS.filter((list) => local.permissions?.[list] === undefined).flatMap(
      (list) => (merged.permissions?.[list] ?? []).map((entry) => `${list} ${entry}`),
    );
  }
  if (feature === 'hooks') return local.hooks === null ? hookItems(merged.hooks) : [];
  return local.ignore.length === 0 ? [...merged.ignore] : [];
}

/** Drops layered settings the local canonical leaves unmanaged; reports the non-empty ones. */
export function dropUnmanagedSettings(
  merged: CanonicalFiles,
  local: CanonicalFiles,
): { canonical: CanonicalFiles; skipped: SkippedSettings[] } {
  const canonical: CanonicalFiles = {
    ...merged,
    mcp: local.mcp === null ? null : merged.mcp,
    permissions: managedPermissions(merged.permissions, local.permissions),
    hooks: local.hooks === null ? null : merged.hooks,
    ignore: local.ignore.length === 0 ? [] : merged.ignore,
  };
  const skipped = SETTINGS_FEATURES.map((feature) => ({
    feature,
    items: skippedItems(feature, merged, local),
  })).filter((entry) => entry.items.length > 0);
  return { canonical, skipped };
}
