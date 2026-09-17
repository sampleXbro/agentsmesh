/**
 * Serializer for Trae's `~/.trae/permission/global.json`.
 *
 * Trae writes this file itself: granting a folder in the IDE appends to
 * `resourceAuthorization.filesystem`, and "Add to allowlist" appends to
 * `approval.commandRules`. Nothing in the file marks who wrote an entry, so
 * agentsmesh is strictly ADDITIVE here — it adds or updates the patterns and
 * paths canonical names and never removes, replaces or reorders anything else.
 * A permission dropped from `.agentsmesh/permissions.yaml` therefore stays in
 * `global.json` until it is removed in Trae; `lintPermissions` says so by name.
 *
 * Two more rules keep the write honest:
 *   - `permissions === null` (no canonical permissions.yaml) writes nothing at
 *     all, so a project that never configured permissions cannot lose grants.
 *   - only the containers agentsmesh needs are created, and only as empty
 *     objects/arrays. `shellSandbox`, `sceneRules`, `mcpRules`, `reviewer` and
 *     the `filesystem`/`network` defaults are real policy: a file that lacks
 *     them keeps lacking them.
 */

import { stringList } from '../import/yaml-import-helpers.js';
import type { Permissions } from '../../core/types.js';
import { projectTraePermissions, TRAE_PROFILE_KEY } from './permissions-format.js';

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonObject(content: string | null): Json {
  if (content === null) return {};
  try {
    const parsed: unknown = JSON.parse(content);
    if (isRecord(parsed)) return parsed;
  } catch {
    // Unparsable user config: fall back to a fresh document.
  }
  return {};
}

/** A copy of `parent[key]`, or an empty object when it has to be created. */
function branch(parent: Json, key: string): Json {
  const value = parent[key];
  return isRecord(value) ? { ...value } : {};
}

/** Appends projected paths; paths already authorized in Trae are never dropped. */
function unionPaths(existing: unknown, projected: readonly string[]): string[] {
  const out = stringList(existing);
  for (const path of projected) {
    if (!out.includes(path)) out.push(path);
  }
  return out;
}

/** Adds or updates the projected patterns; every other rule keeps its own fields. */
function applyBucket(rules: Json, bucket: string, projected: Json): void {
  if (Object.keys(projected).length === 0) return;
  const merged = branch(rules, bucket);
  for (const [pattern, rule] of Object.entries(projected)) {
    const previous = merged[pattern];
    merged[pattern] = isRecord(previous) ? { ...previous, ...(rule as Json) } : rule;
  }
  rules[bucket] = merged;
}

/**
 * Merge canonical permissions into an existing `global.json`. `null` means
 * "leave the file alone": either canonical manages no permissions at all, or it
 * grants nothing Trae can express.
 */
export function serializeTraePermissions(
  permissions: Permissions | null,
  existingContent: string | null,
): string | null {
  if (permissions === null) return null;
  const projection = projectTraePermissions(permissions);
  const { readWrite, readOnly } = projection.filesystem;
  const { exact, prefix } = projection.commandRules;
  const nothingToAdd =
    readWrite.length === 0 &&
    readOnly.length === 0 &&
    Object.keys(exact).length === 0 &&
    Object.keys(prefix).length === 0;
  if (nothingToAdd) return null;

  const root = parseJsonObject(existingContent);

  const profiles = branch(root, 'customProfiles');
  const profile = branch(profiles, TRAE_PROFILE_KEY);
  const approval = branch(profile, 'approval');
  const commandRules = branch(approval, 'commandRules');
  applyBucket(commandRules, 'exact', exact);
  applyBucket(commandRules, 'prefix', prefix);
  approval.commandRules = commandRules;
  profile.approval = approval;
  profiles[TRAE_PROFILE_KEY] = profile;
  root.customProfiles = profiles;

  const authorization = branch(root, 'resourceAuthorization');
  const filesystem = branch(authorization, 'filesystem');
  filesystem.readWrite = unionPaths(filesystem.readWrite, readWrite);
  filesystem.readOnly = unionPaths(filesystem.readOnly, readOnly);
  authorization.filesystem = filesystem;
  root.resourceAuthorization = authorization;

  return JSON.stringify(root, null, 2) + '\n';
}
