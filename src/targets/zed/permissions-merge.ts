/**
 * Merge the generated `agent` overlay onto whatever `settings.json` already has.
 *
 * `settings.json` is the user's editor config, not a managed output, so
 * ownership is per PATTERN — not per key, and not per list. A pattern belongs to
 * agentsmesh exactly when `fromZedRule` decodes it back to a canonical entry,
 * the same test the importer uses. Everything else is a hand-written Rust regex
 * canonical cannot express (`^cargo\s+(build|test)$`, `^sudo`, `secrets?/`) and
 * survives every run. Whole-list replacement used to delete those, including
 * deny rules, on the first generate after they were written.
 *
 * That still makes revocation real: a canonical entry that disappears takes its
 * decodable pattern — and, when nothing is left, the whole tool entry — with it.
 *
 * A per-tool `default` carries no pattern and so no provenance. A stale `allow`
 * is a GRANT and is cleared; `deny`/`confirm` is a restriction and is left
 * alone, because deleting one the user wrote loosens their setup while keeping
 * one agentsmesh wrote is fail-safe.
 */

import { isRecord } from '../../utils/types/guards.js';
import type { ZedToolEntry } from './permissions-settings.js';
import { ZED_OWNED_TOOL_KEYS, fromZedRule } from './permissions-map.js';

const LIST_KEYS = ['always_allow', 'always_deny', 'always_confirm'] as const;

type ListKey = (typeof LIST_KEYS)[number];

/** Entries agentsmesh could not have produced, in the order the user wrote them. */
function foreignPatterns(tool: string, existing: unknown): unknown[] {
  if (!Array.isArray(existing)) return [];
  return existing.filter((entry) => {
    if (!isRecord(entry) || typeof entry['pattern'] !== 'string') return true;
    return fromZedRule(tool, entry['pattern']) === null;
  });
}

function mergeToolEntry(
  tool: string,
  existing: unknown,
  desired: ZedToolEntry | undefined,
): unknown | null {
  const merged: Record<string, unknown> = isRecord(existing) ? { ...existing } : {};
  for (const key of LIST_KEYS as readonly ListKey[]) {
    const list = [...(desired?.[key] ?? []), ...foreignPatterns(tool, merged[key])];
    if (list.length === 0) delete merged[key];
    else merged[key] = list;
  }
  if (desired?.default !== undefined) merged['default'] = desired.default;
  else if (merged['default'] === 'allow') delete merged['default'];
  return Object.keys(merged).length === 0 ? null : merged;
}

/**
 * Merge the generated `agent` overlay onto the file's own value.
 * @returns `undefined` when nothing is left, so the caller drops the key.
 */
export function mergeZedAgent(
  baseAgent: unknown,
  overlayAgent: unknown,
): Record<string, unknown> | undefined {
  const agent: Record<string, unknown> = isRecord(baseAgent) ? { ...baseAgent } : {};
  const basePermissions = agent['tool_permissions'];
  const permissions: Record<string, unknown> = isRecord(basePermissions)
    ? { ...basePermissions }
    : {};
  const baseTools = permissions['tools'];
  const tools: Record<string, unknown> = isRecord(baseTools) ? { ...baseTools } : {};

  const overlayTools =
    isRecord(overlayAgent) && isRecord(overlayAgent['tool_permissions'])
      ? overlayAgent['tool_permissions']['tools']
      : undefined;
  const desired = isRecord(overlayTools) ? (overlayTools as Record<string, ZedToolEntry>) : {};

  for (const tool of ZED_OWNED_TOOL_KEYS) {
    const merged = mergeToolEntry(tool, tools[tool], desired[tool]);
    if (merged === null) delete tools[tool];
    else tools[tool] = merged;
  }

  if (Object.keys(tools).length === 0) delete permissions['tools'];
  else permissions['tools'] = tools;
  if (Object.keys(permissions).length === 0) delete agent['tool_permissions'];
  else agent['tool_permissions'] = permissions;
  return Object.keys(agent).length === 0 ? undefined : agent;
}
