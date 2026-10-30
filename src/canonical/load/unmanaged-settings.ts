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

const MESSAGES: Record<SettingsFeature, (items: string) => string> = {
  mcp: (items) =>
    `[agentsmesh] Skipped MCP servers from installed packs or extends: ${items}. ` +
    'Your own mcp.json has no "mcpServers" key, so AgentsMesh leaves the MCP servers in your tools alone. ' +
    `To use these servers, ${IMPORT_HINT} ` +
    'to copy in the servers your tools already have, or list them under "mcpServers" in mcp.json, then generate again.',
  permissions: (items) =>
    `[agentsmesh] Skipped permissions from installed packs or extends: ${items}. ` +
    'Your own permissions.yaml does not manage these lists (missing or commented out), so AgentsMesh leaves them in your tools alone. ' +
    `To use these permissions, ${IMPORT_HINT} to copy in the permissions your tools already have, ` +
    'or add the list to permissions.yaml (an empty list is fine), then generate again.',
  hooks: (items) =>
    `[agentsmesh] Skipped hooks from installed packs or extends: ${items}. ` +
    'Your own hooks.yaml is missing or has only comments, so AgentsMesh leaves the hooks in your tools alone. ' +
    `To use these hooks, ${IMPORT_HINT} to copy in the hooks your tools already have, ` +
    'or write your hooks in hooks.yaml ("{}" if you have none), then generate again.',
  ignore: (items) =>
    `[agentsmesh] Skipped ignore patterns from installed packs or extends: ${items}. ` +
    'Your own ignore file (.agentsmesh/ignore, or ~/.agentsmesh/ignore with --global) has no patterns, ' +
    'so AgentsMesh leaves the ignore files in your tools alone. ' +
    `To use these patterns, ${IMPORT_HINT} to copy in the patterns your tools already have, ` +
    'or add the patterns you want to your own ignore file, then generate again.',
};

export function unmanagedSettingsMessage(skipped: SkippedSettings): string {
  return MESSAGES[skipped.feature](skipped.items.join(', '));
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
