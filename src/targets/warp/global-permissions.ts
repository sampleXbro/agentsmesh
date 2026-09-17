/**
 * Global-scope permissions support for Warp.
 *
 * `~/.warp/settings.toml` is Warp's only file-based permission surface: the
 * docs describe it as a user-level, hot-reloaded settings file with no project
 * tier. So this is wired through `globalSupport.scopeExtras` (gated on
 * `scope === 'global'`) instead of a plain `generatePermissions`, which would
 * also run at project scope and leak the file into the repo.
 *
 * settings.toml holds unrelated user settings (theme, prefs, other agent
 * options), so generation merges into whatever is on disk and the path stays
 * out of `globalLayout.managedOutputs` — stale cleanup must never delete it.
 * Only the four permission keys are agentsmesh's, and generation rewrites them
 * every time so a revoked canonical entry stops applying in Warp.
 */

import { AB_PERMISSIONS } from '../../core/canonical-paths.js';
import { canonicalDocument, stringList } from '../import/yaml-import-helpers.js';
import { join, dirname } from 'node:path';
import type { CanonicalFiles, GenerateResult, ImportResult } from '../../core/types.js';
import { mkdirp, readFileSafe, writeFileAtomic } from '../../utils/filesystem/fs.js';
import { computeStatus } from '../../core/generate/feature-loop.js';
import { serializeWarpSettings, parseWarpPermissions } from './permissions-toml.js';
import { mapsToWarpKey } from './permissions-format.js';
import type { WarpCommandList } from './permissions-regex.js';
import { WARP_TARGET, WARP_GLOBAL_SETTINGS_FILE } from './constants.js';

export async function generateWarpGlobalPermissions(
  canonical: CanonicalFiles,
  projectRoot: string,
  enabledFeatures: ReadonlySet<string>,
): Promise<GenerateResult[]> {
  if (!enabledFeatures.has('permissions')) return [];

  const existing = await readFileSafe(join(projectRoot, WARP_GLOBAL_SETTINGS_FILE));
  const content = serializeWarpSettings(canonical.permissions, existing);
  if (content === null) return [];

  return [
    {
      target: WARP_TARGET,
      path: WARP_GLOBAL_SETTINGS_FILE,
      content,
      currentContent: existing ?? undefined,
      status: computeStatus(existing, content),
    },
  ];
}

/** Replace what Warp expresses; keep canonical entries it cannot represent. */
function mergeList(existing: unknown, imported: string[], list: WarpCommandList): string[] {
  const preserved = stringList(existing).filter((pattern) => !mapsToWarpKey(pattern, list));
  return [...imported, ...preserved.filter((pattern) => !imported.includes(pattern))];
}

/**
 * Import `~/.warp/settings.toml` (global-only) into canonical `permissions.yaml`.
 * Merges key-scoped: only `allow` and `deny` are rewritten, and even there the
 * entries Warp cannot express (bare `Bash`, `Edit(...)`, denied reads) are kept.
 * `ask`, every other key and the file's comments survive untouched.
 */
export async function importWarpGlobalPermissions(
  projectRoot: string,
  results: ImportResult[],
): Promise<void> {
  const srcPath = join(projectRoot, WARP_GLOBAL_SETTINGS_FILE);
  const content = await readFileSafe(srcPath);
  if (content === null) return;

  const permissions = parseWarpPermissions(content);
  if (!permissions) return;

  const destPath = join(projectRoot, AB_PERMISSIONS);
  const doc = canonicalDocument(await readFileSafe(destPath));
  const existing = (doc.toJS() ?? {}) as Record<string, unknown>;
  doc.set('allow', mergeList(existing.allow, permissions.allow, 'allow'));
  doc.set('deny', mergeList(existing.deny, permissions.deny, 'deny'));

  await mkdirp(dirname(destPath));
  await writeFileAtomic(destPath, doc.toString().trimEnd() + '\n');
  results.push({
    fromTool: WARP_TARGET,
    fromPath: srcPath,
    toPath: AB_PERMISSIONS,
    feature: 'permissions',
  });
}
