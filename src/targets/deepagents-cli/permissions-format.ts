/**
 * Canonical permissions <-> Deep Agents CLI `~/.deepagents/config.toml`.
 *
 * EMBEDDED, not native. Three reasons, all from `config_manifest.py`
 * (github.com/langchain-ai/deepagents/blob/main/libs/code/deepagents_code/
 * config_manifest.py):
 *   1. This folds into the general user config file that also holds
 *      credentials, model choice and display state.
 *   2. There is no dedicated permissions file and no top-level `permissions`
 *      key — only `ConfigOption(key='shell.allow_list')` and
 *      `ConfigOption(key='startup.mode')`.
 *   3. The surface expresses a shell-command ALLOW list plus one global
 *      approval mode. There are no deny rules, no ask rules, and no per-tool
 *      or per-path patterns.
 *
 * So the projection is lossy: only `Bash(<command>[:*])`-shaped canonical
 * allow entries reach `shell.allow_list`. Bare `Bash`, non-shell tool patterns,
 * and every `deny` / `ask` entry have no representation — `lintPermissions`
 * names each one so nothing is dropped silently.
 */

import { isRecord } from '../../utils/types/guards.js';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import type { Permissions } from '../../core/types.js';

/** Approval-mode keywords `allow_list` accepts instead of concrete commands. */
const ALLOW_LIST_KEYWORDS = new Set(['recommended', 'all']);

/**
 * `startup.mode` is pinned to the most restrictive of `manual | auto | yolo`:
 * `shell.allow_list` is the set of exceptions to manual approval, so `auto` or
 * `yolo` would grant strictly more than the canonical permissions allow.
 */
const STARTUP_MODE = 'manual';

export interface UnmappedPermissions {
  readonly allow: readonly string[];
  readonly deny: readonly string[];
  readonly ask: readonly string[];
}

/** `Bash(git status:*)` -> `git status`; anything else -> null. */
function shellCommand(pattern: string): string | null {
  const match = /^Bash\((.*)\)$/s.exec(pattern.trim());
  if (!match) return null;
  let command = match[1]!.trim();
  if (command.endsWith(':*')) command = command.slice(0, -2).trim();
  return command || null;
}

export function shellAllowList(permissions: Permissions | null): string[] {
  const commands = new Set<string>();
  for (const pattern of permissions?.allow ?? []) {
    const command = shellCommand(pattern);
    if (command) commands.add(command);
  }
  return [...commands];
}

/** Canonical entries with no `config.toml` equivalent, grouped by list. */
export function unmappedPermissionEntries(permissions: Permissions | null): UnmappedPermissions {
  return {
    allow: (permissions?.allow ?? []).filter((pattern) => shellCommand(pattern) === null),
    deny: permissions?.deny ?? [],
    ask: permissions?.ask ?? [],
  };
}

function parseTomlObject(content: string | null): Record<string, unknown> {
  if (content === null) return {};
  try {
    const parsed: unknown = parseToml(content);
    if (isRecord(parsed)) return parsed;
  } catch {
    // Unparsable user config: fall back to a fresh document.
  }
  return {};
}

function tableCopy(root: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = root[key];
  return isRecord(value) ? { ...value } : {};
}

/**
 * Merge canonical permissions into an existing `config.toml`. Every unrelated
 * key survives — this is the user's own config file, not an agentsmesh artifact.
 */
export function serializeDeepagentsConfig(
  permissions: Permissions | null,
  existingContent: string | null,
): string | null {
  const allowList = shellAllowList(permissions);
  if (allowList.length === 0) return null;

  const root = parseTomlObject(existingContent);
  const shell = tableCopy(root, 'shell');
  shell.allow_list = allowList;
  const startup = tableCopy(root, 'startup');
  startup.mode = STARTUP_MODE;

  return stringifyToml({ ...root, shell, startup }).trimEnd() + '\n';
}

/** `allow_list` is a TOML array or a comma-separated string. */
function allowListEntries(value: unknown): string[] {
  const raw = typeof value === 'string' ? value.split(',') : Array.isArray(value) ? value : [];
  return raw
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function parseDeepagentsPermissions(content: string): Permissions | null {
  const shell = parseTomlObject(content).shell;
  if (!isRecord(shell)) return null;

  const allow: string[] = [];
  for (const entry of allowListEntries(shell.allow_list)) {
    if (ALLOW_LIST_KEYWORDS.has(entry.toLowerCase())) continue;
    const pattern = `Bash(${entry}:*)`;
    if (!allow.includes(pattern)) allow.push(pattern);
  }
  if (allow.length === 0) return null;
  return { allow, deny: [] };
}
