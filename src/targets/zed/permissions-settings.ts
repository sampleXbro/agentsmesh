/**
 * Canonical permissions <-> `agent.tool_permissions` in `~/.config/zed/settings.json`.
 *
 * Global-only by construction: `tool_permissions` lives on `AgentSettingsContent`
 * (crates/settings_content/src/agent.rs), which hangs off the USER-level
 * `SettingsContent`. `SettingsStore::set_local_settings` parses `.zed/settings.json`
 * strictly as `ProjectSettingsContent`, which has no `agent` field at all, so the
 * same JSON written there is discarded. The scope gate lives in `scoped-settings.ts`.
 *
 * This module is the canonical <-> Zed shape conversion only; the merge onto a
 * user's existing file lives in `permissions-merge.ts`.
 *
 * Zed also ships hardcoded terminal deny rules for recursive deletion (`rm -rf /`,
 * `~`, `$HOME`, `.`, `..`) that no setting can override; canonical cannot loosen them.
 */

import { isRecord } from '../../utils/types/guards.js';
import type { Permissions } from '../../core/types.js';
import { ZED_OWNED_TOOL_KEYS, toZedRule, fromZedRule } from './permissions-map.js';

export type ZedDecision = 'allow' | 'deny' | 'confirm';

export interface ZedPattern {
  readonly pattern: string;
  readonly case_sensitive?: boolean;
}

export interface ZedToolEntry {
  default?: ZedDecision;
  always_allow?: ZedPattern[];
  always_deny?: ZedPattern[];
  always_confirm?: ZedPattern[];
}

type ListKey = 'always_allow' | 'always_deny' | 'always_confirm';

const DECISIONS: readonly { list: keyof Permissions; key: ListKey; decision: ZedDecision }[] = [
  { list: 'allow', key: 'always_allow', decision: 'allow' },
  { list: 'deny', key: 'always_deny', decision: 'deny' },
  { list: 'ask', key: 'always_confirm', decision: 'confirm' },
];

function entriesOf(permissions: Permissions | null, list: keyof Permissions): readonly string[] {
  return (permissions?.[list] as string[] | undefined) ?? [];
}

/**
 * The owned tool entries for the current canonical permissions.
 *
 * Patterns are written `case_sensitive: true`: canonical payloads are literal
 * commands and paths, and Zed's case-insensitive default would widen both the
 * grants and the denials past what the user actually wrote.
 */
export function buildZedToolEntries(permissions: Permissions | null): Record<string, ZedToolEntry> {
  const tools: Record<string, ZedToolEntry> = {};
  const entryFor = (tool: string): ZedToolEntry => (tools[tool] ??= {});

  for (const { list, key, decision } of DECISIONS) {
    for (const pattern of entriesOf(permissions, list)) {
      const rule = toZedRule(pattern);
      if (rule === null) continue;
      if (rule.regex === null) {
        entryFor(rule.tool).default = decision;
        continue;
      }
      const patterns = (entryFor(rule.tool)[key] ??= []);
      if (patterns.some((existing) => existing.pattern === rule.regex)) continue;
      patterns.push({ pattern: rule.regex, case_sensitive: true });
    }
  }

  // Stable key order so an unchanged canonical file produces an unchanged diff.
  const ordered: Record<string, ZedToolEntry> = {};
  for (const tool of ZED_OWNED_TOOL_KEYS) {
    if (tools[tool]) ordered[tool] = tools[tool]!;
  }
  return ordered;
}

function readTools(settings: Record<string, unknown>): Record<string, unknown> | null {
  const agent = settings['agent'];
  if (!isRecord(agent)) return null;
  const permissions = agent['tool_permissions'];
  if (!isRecord(permissions)) return null;
  const tools = permissions['tools'];
  return isRecord(tools) ? tools : null;
}

function pushUnique(list: string[], pattern: string | null): void {
  if (pattern !== null && !list.includes(pattern)) list.push(pattern);
}

/** `agent.tool_permissions` back to canonical lists; `null` when nothing maps. */
export function parseZedPermissions(settings: Record<string, unknown>): Permissions | null {
  const tools = readTools(settings);
  if (tools === null) return null;

  const result: Permissions = { allow: [], deny: [], ask: [] };
  for (const [tool, rawEntry] of Object.entries(tools)) {
    if (!isRecord(rawEntry)) continue;
    for (const { list, key, decision } of DECISIONS) {
      const target = result[list] as string[];
      if (rawEntry['default'] === decision) pushUnique(target, fromZedRule(tool, null));
      const patterns = rawEntry[key];
      if (!Array.isArray(patterns)) continue;
      for (const entry of patterns) {
        if (!isRecord(entry) || typeof entry['pattern'] !== 'string') continue;
        pushUnique(target, fromZedRule(tool, entry['pattern']));
      }
    }
  }

  const total = result.allow.length + result.deny.length + (result.ask?.length ?? 0);
  return total === 0 ? null : result;
}

/** Canonical entries Zed has no permission tool for, in allow/deny/ask order. */
export function unmappedPermissionEntries(permissions: Permissions | null): string[] {
  const unmapped: string[] = [];
  for (const { list } of DECISIONS) {
    for (const pattern of entriesOf(permissions, list)) {
      if (toZedRule(pattern) === null && !unmapped.includes(pattern)) unmapped.push(pattern);
    }
  }
  return unmapped;
}
