/**
 * Goose tool permissions live in the global `~/.config/goose/permission.yaml`
 * (Open-source Goose, `crates/goose/src/config/permission.rs`): a YAML map keyed
 * by category (`user`, `smart_approve`, …) where each category is a
 * `PermissionConfig { always_allow, ask_before, never_allow }` of tool-name
 * lists. AgentsMesh owns the `user` category and maps it to canonical
 * permissions as allow↔always_allow, ask↔ask_before, deny↔never_allow.
 *
 * The `smart_approve` category is a runtime cache Goose maintains, so generation
 * merge-preserves every non-`user` category from the existing file. There is no
 * project-level permission file, so this is global-only.
 */

import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import type { Permissions } from '../../core/canonical-types.js';
import { toStringArray } from '../import/shared-import-helpers.js';
import { managedLists } from '../../core/permissions.js';
import { isRecord } from '../../utils/types/guards.js';

function parseYamlObject(content: string | null): Record<string, unknown> {
  if (content === null) return {};
  try {
    const parsed = parseYaml(content);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through to empty
  }
  return {};
}

const USER_KEYS = { allow: 'always_allow', ask: 'ask_before', deny: 'never_allow' } as const;

/**
 * Write the lists permissions.yaml manages into the `user` category; an
 * unmanaged one keeps the user's value. Goose has no serde defaults and will
 * not start when a list is missing, so every list is written, `[]` when empty.
 * Returns null when no list is managed, or when there is nothing to write and
 * no file.
 */
export function serializeGoosePermissions(
  permissions: Permissions | null,
  existingContent: string | null,
): string | null {
  const lists = managedLists(permissions, ['allow', 'ask', 'deny']);
  if (Object.keys(lists).length === 0) return null;

  const root = parseYamlObject(existingContent);
  const user: Record<string, unknown> = isRecord(root.user) ? { ...root.user } : {};
  for (const [list, key] of Object.entries(USER_KEYS)) {
    user[key] = lists[list as keyof typeof USER_KEYS] ?? user[key] ?? [];
  }
  const hasEntries = Object.values(lists).some((entries) => entries.length > 0);
  if (hasEntries || 'user' in root) root.user = user;
  if (existingContent === null && Object.keys(root).length === 0) return null;
  return stringifyYaml(root).trimEnd() + '\n';
}

export function parseGoosePermissions(content: string): Permissions | null {
  const root = parseYamlObject(content);
  const user = root.user;
  if (!user || typeof user !== 'object' || Array.isArray(user)) return null;
  const block = user as Record<string, unknown>;
  const allow = toStringArray(block.always_allow);
  const ask = toStringArray(block.ask_before);
  const deny = toStringArray(block.never_allow);
  if (allow.length === 0 && ask.length === 0 && deny.length === 0) return null;
  const permissions: Permissions = { allow, deny };
  if (ask.length > 0) permissions.ask = ask;
  return permissions;
}
