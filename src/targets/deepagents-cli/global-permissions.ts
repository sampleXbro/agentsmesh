/**
 * Global-scope permissions support for Deep Agents CLI.
 *
 * `~/.deepagents/config.toml` is the only permission surface: `_paths.py`
 * exposes no project-tier config.toml, so this is wired through
 * `globalSupport.scopeExtras` (gated on `scope === 'global'`) instead of a
 * plain `generatePermissions`, which would also run at project scope and leak
 * the file into the repo.
 *
 * config.toml is a shared user file (credentials, model, display state), so
 * generation merges into whatever is on disk and the path stays out of
 * `globalLayout.managedOutputs` — stale cleanup must never delete it.
 */

import { AB_PERMISSIONS } from '../../core/canonical-paths.js';
import { join, dirname } from 'node:path';
import { stringify as yamlStringify } from 'yaml';
import type { CanonicalFiles, GenerateResult, ImportResult } from '../../core/types.js';
import { mkdirp, readFileSafe, writeFileAtomic } from '../../utils/filesystem/fs.js';
import { computeStatus } from '../../core/generate/feature-loop.js';
import { serializeDeepagentsConfig, parseDeepagentsPermissions } from './permissions-format.js';
import { DEEPAGENTS_CLI_TARGET, DEEPAGENTS_CLI_GLOBAL_CONFIG_FILE } from './constants.js';

export async function generateDeepagentsCliGlobalPermissions(
  canonical: CanonicalFiles,
  projectRoot: string,
  enabledFeatures: ReadonlySet<string>,
): Promise<GenerateResult[]> {
  if (!enabledFeatures.has('permissions')) return [];

  const existing = await readFileSafe(join(projectRoot, DEEPAGENTS_CLI_GLOBAL_CONFIG_FILE));
  const content = serializeDeepagentsConfig(canonical.permissions, existing);
  if (content === null) return [];

  return [
    {
      target: DEEPAGENTS_CLI_TARGET,
      path: DEEPAGENTS_CLI_GLOBAL_CONFIG_FILE,
      content,
      currentContent: existing ?? undefined,
      status: computeStatus(existing, content),
    },
  ];
}

/** Import `~/.deepagents/config.toml` (global-only) into canonical `permissions.yaml`. */
export async function importDeepagentsCliGlobalPermissions(
  projectRoot: string,
  results: ImportResult[],
): Promise<void> {
  const srcPath = join(projectRoot, DEEPAGENTS_CLI_GLOBAL_CONFIG_FILE);
  const content = await readFileSafe(srcPath);
  if (content === null) return;

  const permissions = parseDeepagentsPermissions(content);
  if (!permissions) return;

  const destPath = join(projectRoot, AB_PERMISSIONS);
  await mkdirp(dirname(destPath));
  await writeFileAtomic(destPath, yamlStringify(permissions).trimEnd() + '\n');
  results.push({
    fromTool: DEEPAGENTS_CLI_TARGET,
    fromPath: srcPath,
    toPath: AB_PERMISSIONS,
    feature: 'permissions',
  });
}
