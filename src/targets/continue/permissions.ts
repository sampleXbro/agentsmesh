/**
 * Continue's personal permissions file (`~/.continue/permissions.yaml`) uses
 * three top-level keys — `allow`, `ask`, `exclude` — each an array of
 * tool-matcher pattern strings (e.g. `Read(*)` or a `Write(...)` glob). This
 * maps to canonical permissions as allow↔allow, ask↔ask, and exclude↔deny.
 *
 * Continue only reads this at the personal (global) tier today; project-level
 * permissions are explicitly "not implemented yet" upstream, so generation and
 * import are global-only.
 */

import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import type { Permissions } from '../../core/canonical-types.js';
import { managedLists } from '../../core/permissions.js';
import { toStringArray } from '../import/shared-import-helpers.js';

const CONTINUE_KEYS = { allow: 'allow', ask: 'ask', deny: 'exclude' } as const;

/**
 * Write the lists permissions.yaml manages, `[]` when empty (Continue's own
 * default file does the same). An unmanaged list is left out, so the owned-keys
 * merge keeps the user's key. Returns null when no list is managed, or when
 * every managed list is empty and there is no file.
 */
export function serializeContinuePermissions(
  permissions: Permissions | null,
  existingContent: string | null,
): string | null {
  const lists = managedLists(permissions, ['allow', 'ask', 'deny']);
  const out: Record<string, string[]> = {};
  for (const [list, key] of Object.entries(CONTINUE_KEYS)) {
    const entries = lists[list as keyof typeof CONTINUE_KEYS];
    if (entries !== undefined) out[key] = entries;
  }
  const managed = Object.values(out);
  if (managed.length === 0) return null;
  if (existingContent === null && managed.every((entries) => entries.length === 0)) return null;
  return stringifyYaml(out).trimEnd() + '\n';
}

export function parseContinuePermissions(content: string): Permissions | null {
  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const allow = toStringArray(record.allow);
  const ask = toStringArray(record.ask);
  const deny = toStringArray(record.exclude);
  if (allow.length === 0 && ask.length === 0 && deny.length === 0) return null;
  const permissions: Permissions = { allow, deny };
  if (ask.length > 0) permissions.ask = ask;
  return permissions;
}
