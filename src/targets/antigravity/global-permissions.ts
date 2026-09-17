/**
 * Global-scope permissions for Antigravity.
 *
 * antigravity.google/docs/cli/permissions/: the three access lists are
 * "configured inside your global settings: ~/.gemini/antigravity-cli/settings.json".
 * Per-project permissions live outside the repo under `~/.gemini/config/projects/`,
 * so there is no project tier — this is wired through `globalSupport.scopeExtras`
 * (gated on `scope === 'global'`) instead of a plain `generatePermissions`, which
 * would also run at project scope and leak the file into the repo.
 *
 * settings.json is the user's own file: generation merges key-scoped (only
 * allow/deny/ask inside `permissions` are agentsmesh's) and the path stays out of
 * `managedOutputs` so stale cleanup never deletes it. The owned keys are rewritten
 * on every run, so a grant removed from canonical stops applying in Antigravity.
 */

import { AB_PERMISSIONS } from '../../core/canonical-paths.js';
import { canonicalDocument } from '../import/yaml-import-helpers.js';
import { dirname, join } from 'node:path';
import type {
  CanonicalFiles,
  GenerateResult,
  ImportResult,
  Permissions,
} from '../../core/types.js';
import { mkdirp, readFileSafe, writeFileAtomic } from '../../utils/filesystem/fs.js';
import { computeStatus } from '../../core/generate/feature-loop.js';
import { toStringArray } from '../import/shared-import-helpers.js';
import { ANTIGRAVITY_TARGET, ANTIGRAVITY_GLOBAL_SETTINGS_FILE } from './constants.js';

const OWNED_KEYS = ['allow', 'deny', 'ask'] as const;

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
    // Unparsable user settings: fall back to a fresh document.
  }
  return {};
}

function ownedLists(permissions: Permissions | null): Json {
  if (!permissions) return {};
  const lists: Json = {};
  if (permissions.allow.length > 0) lists.allow = permissions.allow;
  if (permissions.deny.length > 0) lists.deny = permissions.deny;
  if ((permissions.ask ?? []).length > 0) lists.ask = permissions.ask;
  return lists;
}

/**
 * Merge canonical permissions into an existing settings.json. `null` means
 * "leave the file alone": canonical says nothing and no owned key is on disk to
 * clear, so a blank permissions.yaml never overrides Antigravity's defaults.
 */
export function serializeAntigravitySettings(
  permissions: Permissions | null,
  existingContent: string | null,
): string | null {
  const lists = ownedLists(permissions);
  const root = parseJsonObject(existingContent);
  const block = isRecord(root.permissions) ? { ...root.permissions } : {};
  const ownsKeyOnDisk = OWNED_KEYS.some((key) => key in block);
  if (Object.keys(lists).length === 0 && !ownsKeyOnDisk) return null;

  for (const key of OWNED_KEYS) delete block[key];
  const merged = { ...block, ...lists };
  if (Object.keys(merged).length === 0) delete root.permissions;
  else root.permissions = merged;
  return JSON.stringify(root, null, 2) + '\n';
}

export async function generateAntigravityGlobalPermissions(
  canonical: CanonicalFiles,
  projectRoot: string,
  enabledFeatures: ReadonlySet<string>,
): Promise<GenerateResult[]> {
  if (!enabledFeatures.has('permissions')) return [];

  const existing = await readFileSafe(join(projectRoot, ANTIGRAVITY_GLOBAL_SETTINGS_FILE));
  const content = serializeAntigravitySettings(canonical.permissions, existing);
  if (content === null) return [];

  return [
    {
      target: ANTIGRAVITY_TARGET,
      path: ANTIGRAVITY_GLOBAL_SETTINGS_FILE,
      content,
      currentContent: existing ?? undefined,
      status: computeStatus(existing, content),
    },
  ];
}

/**
 * Import the global settings file into canonical `permissions.yaml`. Antigravity
 * rules are already `action(target)` strings, so the three lists map one-to-one
 * and are replaced wholesale — a rule dropped in Antigravity must disappear from
 * canonical too. Generate writes all three owned keys and deletes one that
 * empties, so an owned key missing from a `permissions` block means the user
 * revoked that whole list: canonical is emptied to match, but only when it
 * already had the key, so import never invents `ask: []` noise. Comments and
 * every other canonical key survive untouched.
 */
export async function importAntigravityGlobalPermissions(
  projectRoot: string,
  results: ImportResult[],
): Promise<void> {
  const srcPath = join(projectRoot, ANTIGRAVITY_GLOBAL_SETTINGS_FILE);
  const content = await readFileSafe(srcPath);
  if (content === null) return;

  const block = parseJsonObject(content).permissions;
  if (!isRecord(block)) return;

  const destPath = join(projectRoot, AB_PERMISSIONS);
  const doc = canonicalDocument(await readFileSafe(destPath));
  for (const key of OWNED_KEYS) {
    if (key in block) doc.set(key, toStringArray(block[key]));
    else if (doc.has(key)) doc.set(key, []);
  }

  await mkdirp(dirname(destPath));
  await writeFileAtomic(destPath, doc.toString().trimEnd() + '\n');
  results.push({
    fromTool: ANTIGRAVITY_TARGET,
    fromPath: srcPath,
    toPath: AB_PERMISSIONS,
    feature: 'permissions',
  });
}
