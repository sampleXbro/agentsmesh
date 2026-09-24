/**
 * Merge canonical files from extends with local. Overlay wins on same-name conflict.
 */

import { basename } from 'node:path';
import type {
  CanonicalFiles,
  CanonicalRule,
  McpConfig,
  Permissions,
  HookEntry,
  Hooks,
} from '../../core/types.js';

function ruleSlug(r: CanonicalRule): string {
  return basename(r.source, '.md');
}

/**
 * Merge overlay onto base. Overlay wins on same-name conflict for rules, commands, agents, skills.
 * MCP: overlay servers merge, overlay wins same-name. Permissions: union; local deny wins.
 * Hooks: an overlay event replaces the base event (layered config overrides);
 * with `hooks: 'combine'` (installed packs) both sides are kept, see {@link combineHooks}.
 *
 * @param base - Base canonical files (earlier in merge order)
 * @param overlay - Overlay canonical files (later, wins on conflict)
 * @returns Merged CanonicalFiles
 */
/** Overlay wins per key; base keeps its position, new overlay entries append. */
function mergeByKey<T>(base: readonly T[], overlay: readonly T[], key: (item: T) => string): T[] {
  return [...new Map([...base, ...overlay].map((item) => [key(item), item])).values()];
}

export interface MergeOptions {
  /** `override` (default): an overlay event replaces the base event. `combine`: keep both. */
  readonly hooks?: 'override' | 'combine';
}

export function mergeCanonicalFiles(
  base: CanonicalFiles,
  overlay: CanonicalFiles,
  options: MergeOptions = {},
): CanonicalFiles {
  const mcp: McpConfig | null = mergeMcp(base.mcp, overlay.mcp);
  const permissions: Permissions | null = mergePermissions(base.permissions, overlay.permissions);
  const hooks: Hooks | null =
    options.hooks === 'combine'
      ? combineHooks(base.hooks, overlay.hooks)
      : overrideHooks(base.hooks, overlay.hooks);
  const ignore = mergeUniqueStrings(base.ignore, overlay.ignore);

  return {
    rules: mergeByKey(base.rules, overlay.rules, ruleSlug),
    commands: mergeByKey(base.commands, overlay.commands, (c) => c.name),
    agents: mergeByKey(base.agents, overlay.agents, (a) => a.name),
    skills: mergeByKey(base.skills, overlay.skills, (s) => s.name),
    mcp,
    permissions,
    hooks,
    ignore,
  };
}

function mergeMcp(base: McpConfig | null, overlay: McpConfig | null): McpConfig | null {
  if (!base && !overlay) return null;
  const baseServers = base?.mcpServers ?? {};
  const overlayServers = overlay?.mcpServers ?? {};
  return {
    mcpServers: { ...baseServers, ...overlayServers },
  };
}

function mergePermissions(
  base: Permissions | null,
  overlay: Permissions | null,
): Permissions | null {
  if (!base && !overlay) return null;
  const allow = mergeUniqueStrings(base?.allow ?? [], overlay?.allow ?? []);
  const deny = mergeUniqueStrings(base?.deny ?? [], overlay?.deny ?? []);
  const ask = mergeUniqueStrings(base?.ask ?? [], overlay?.ask ?? []);
  return { allow, deny, ask };
}

function mergeUniqueStrings(base: string[], overlay: string[]): string[] {
  const seen = new Set(base);
  const merged = [...base];
  for (const value of overlay) {
    if (!seen.has(value)) {
      seen.add(value);
      merged.push(value);
    }
  }
  return merged;
}

function overrideHooks(base: Hooks | null, overlay: Hooks | null): Hooks | null {
  if (!base && !overlay) return null;
  const result: Hooks = {};
  for (const k of hookEvents(base, overlay)) {
    const o = overlay?.[k];
    result[k] = o !== undefined && o.length > 0 ? o : (base?.[k] ?? []);
  }
  return result;
}

/**
 * Per event, every hook of `first`, then each hook of `then` that `first` does
 * not already define (same type, matcher and command: the `first` copy wins).
 */
export function combineHooks(first: Hooks | null, then: Hooks | null): Hooks | null {
  if (!first && !then) return null;
  const result: Hooks = {};
  for (const k of hookEvents(first, then)) {
    const kept = first?.[k] ?? [];
    const defined = new Set(kept.map(hookKey));
    result[k] = [...kept, ...(then?.[k] ?? []).filter((entry) => !defined.has(hookKey(entry)))];
  }
  return result;
}

function hookEvents(a: Hooks | null, b: Hooks | null): Array<keyof Hooks> {
  return [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])] as Array<keyof Hooks>;
}

function hookKey(entry: HookEntry): string {
  return JSON.stringify([entry.type ?? 'command', entry.matcher, entry.command]);
}
