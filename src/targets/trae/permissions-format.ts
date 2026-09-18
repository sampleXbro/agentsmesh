/**
 * Canonical permissions <-> Trae `~/.trae/permission/global.json`.
 *
 * docs.trae.ai/ide/permission-and-approval: "Resource authorization, rules, and
 * custom permission mode configurations are managed through the
 * ~/.trae/permission/global.json file". The two surfaces agentsmesh projects
 * onto are:
 *
 *   `customProfiles.defaultCustomProfile.approval.commandRules` — command
 *     patterns bucketed by match kind (`exact` / `prefix` / `regex`), each rule
 *     carrying `approval: allow | ask | deny` (plus optional `execEnv`).
 *   `resourceAuthorization.filesystem.readWrite` / `.readOnly` — authorized
 *     paths. There is no filesystem deny list.
 *
 * So `Bash(cmd:*)` becomes a `prefix` rule, `Bash(cmd)` an `exact` rule, and an
 * ALLOWED `Read(path)` / `Edit(path)` / `Write(path)` becomes a filesystem
 * entry. Everything else — blanket tool toggles (`Read`, `Grep`, `WebFetch`),
 * denied or asked file paths, MCP tool names — has no key and is reported by
 * `lintPermissions`. The `regex` bucket has no canonical form: agentsmesh never
 * writes it and never deletes it.
 */

import { isRecord } from '../../utils/types/guards.js';
import type { Permissions } from '../../core/types.js';

export const TRAE_PROFILE_KEY = 'defaultCustomProfile';

export type TraeApproval = 'allow' | 'ask' | 'deny';
export type TraeList = 'allow' | 'deny' | 'ask';

/** Applied in order so the most restrictive decision wins on a repeated pattern. */
const LIST_ORDER: readonly TraeList[] = ['allow', 'ask', 'deny'];
const READ_WRITE_TOOLS = new Set(['Edit', 'Write']);

export interface TraeCommandRules {
  readonly exact: Record<string, { approval: TraeApproval }>;
  readonly prefix: Record<string, { approval: TraeApproval }>;
}

export interface TraePermissionProjection {
  readonly filesystem: { readonly readWrite: string[]; readonly readOnly: string[] };
  readonly commandRules: TraeCommandRules;
}

export interface UnmappedPermissions {
  readonly allow: readonly string[];
  readonly deny: readonly string[];
  readonly ask: readonly string[];
}

/** `Bash(git status:*)` -> `{ bucket: 'prefix', command: 'git status' }`. */
function commandRule(pattern: string): { bucket: 'exact' | 'prefix'; command: string } | null {
  const match = /^Bash\((.*)\)$/s.exec(pattern.trim());
  if (!match) return null;
  const payload = match[1]!.trim();
  const prefix = payload.endsWith(':*');
  const command = (prefix ? payload.slice(0, -2) : payload).trim();
  return command ? { bucket: prefix ? 'prefix' : 'exact', command } : null;
}

/** `Edit(./src)` -> `{ key: 'readWrite', path: './src' }`; allow list only. */
function filePath(pattern: string): { key: 'readWrite' | 'readOnly'; path: string } | null {
  const match = /^(Read|Edit|Write)\((.*)\)$/s.exec(pattern.trim());
  const path = match?.[2]?.trim();
  if (!match || !path) return null;
  return { key: READ_WRITE_TOOLS.has(match[1]!) ? 'readWrite' : 'readOnly', path };
}

/** True when the canonical entry lands in a Trae key on the given list. */
export function mapsToTraeKey(pattern: string, list: TraeList): boolean {
  if (commandRule(pattern) !== null) return true;
  return list === 'allow' && filePath(pattern) !== null;
}

export function projectTraePermissions(permissions: Permissions | null): TraePermissionProjection {
  const exact: Record<string, { approval: TraeApproval }> = {};
  const prefix: Record<string, { approval: TraeApproval }> = {};
  const readWrite: string[] = [];
  const readOnly: string[] = [];

  for (const list of LIST_ORDER) {
    for (const pattern of permissions?.[list] ?? []) {
      const rule = commandRule(pattern);
      if (rule !== null) {
        const bucket = rule.bucket === 'exact' ? exact : prefix;
        bucket[rule.command] = { approval: list };
        continue;
      }
      const file = list === 'allow' ? filePath(pattern) : null;
      if (file === null) continue;
      const target = file.key === 'readWrite' ? readWrite : readOnly;
      if (!target.includes(file.path)) target.push(file.path);
    }
  }

  return {
    filesystem: { readWrite, readOnly: readOnly.filter((path) => !readWrite.includes(path)) },
    commandRules: { exact, prefix },
  };
}

/** Canonical entries with no Trae key, grouped by list. */
export function unmappedPermissionEntries(permissions: Permissions | null): UnmappedPermissions {
  const pick = (list: TraeList): string[] =>
    (permissions?.[list] ?? []).filter((pattern) => !mapsToTraeKey(pattern, list));
  return { allow: pick('allow'), deny: pick('deny'), ask: pick('ask') };
}

/** Canonical entries agentsmesh adds to `global.json` and never removes again. */
export function mappedPermissionEntries(permissions: Permissions | null): UnmappedPermissions {
  const pick = (list: TraeList): string[] =>
    (permissions?.[list] ?? []).filter((pattern) => mapsToTraeKey(pattern, list));
  return { allow: pick('allow'), deny: pick('deny'), ask: pick('ask') };
}

function approvalOf(value: unknown): TraeApproval | null {
  if (!isRecord(value)) return null;
  const approval = value.approval;
  return approval === 'allow' || approval === 'ask' || approval === 'deny' ? approval : null;
}

function collectRules(bucket: unknown, suffix: string, out: Record<TraeList, string[]>): void {
  if (!isRecord(bucket)) return;
  for (const [command, rule] of Object.entries(bucket)) {
    const approval = approvalOf(rule);
    if (approval === null || command.trim() === '') continue;
    out[approval].push(`Bash(${command}${suffix})`);
  }
}

function collectPaths(value: unknown, tool: 'Edit' | 'Read', out: string[]): void {
  if (!Array.isArray(value)) return;
  for (const path of value) {
    if (typeof path === 'string' && path.trim() !== '') out.push(`${tool}(${path})`);
  }
}

/** Read the owned Trae keys back into canonical permissions; `null` when there are none. */
export function traeToPermissions(root: unknown): Required<Permissions> | null {
  if (!isRecord(root)) return null;
  const lists: Record<TraeList, string[]> = { allow: [], deny: [], ask: [] };

  const profiles = isRecord(root.customProfiles) ? root.customProfiles : {};
  const profile = isRecord(profiles[TRAE_PROFILE_KEY]) ? profiles[TRAE_PROFILE_KEY] : {};
  const approval = isRecord(profile.approval) ? profile.approval : {};
  const commandRules = isRecord(approval.commandRules) ? approval.commandRules : {};
  collectRules(commandRules.exact, '', lists);
  collectRules(commandRules.prefix, ':*', lists);

  const authorization = isRecord(root.resourceAuthorization) ? root.resourceAuthorization : {};
  const filesystem = isRecord(authorization.filesystem) ? authorization.filesystem : {};
  collectPaths(filesystem.readWrite, 'Edit', lists.allow);
  collectPaths(filesystem.readOnly, 'Read', lists.allow);

  const empty = LIST_ORDER.every((list) => lists[list].length === 0);
  return empty ? null : lists;
}
