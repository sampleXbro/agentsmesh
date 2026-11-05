/**
 * `globalSupport.scopeExtras` for Kimi Code.
 *
 * `~/.kimi-code/config.toml` is the CLI's only settings file — the docs
 * document no project tier — so hooks and permissions are emitted here, gated
 * on `scope === 'global'`, instead of from plain feature generators that would
 * also run at project scope and drop a bogus file into the repo.
 *
 * Both features land on this one path, and one emitter owns it: the merge reads
 * the file once and applies both owned keys together, so neither feature can
 * erase the other's work. The path stays out of `managedOutputs` — stale
 * cleanup must never delete the file that holds the user's API keys.
 */

import { join } from 'node:path';
import type { CanonicalFiles, GenerateResult } from '../../core/types.js';
import type { ScopeExtrasFn } from '../catalog/target-descriptor.js';
import { readFileSafe } from '../../utils/filesystem/fs.js';
import { computeStatus } from '../../core/generate/feature-loop.js';
import { serializeKimiConfig, type KimiOwnedConfig } from './config-toml.js';
import { buildKimiHookEntries } from './hooks-format.js';
import { buildKimiPermissionRules } from './permissions-format.js';
import { PERMISSION_LISTS } from '../../core/permissions.js';
import { KIMI_CODE_TARGET, KIMI_CODE_GLOBAL_CONFIG_FILE } from './constants.js';

function ownedConfig(
  canonical: CanonicalFiles,
  enabledFeatures: ReadonlySet<string>,
): KimiOwnedConfig {
  return {
    ...(enabledFeatures.has('hooks') ? { hooks: buildKimiHookEntries(canonical.hooks) } : {}),
    // No permissions.yaml list: permissions are unmanaged, so the rules stay untouched.
    ...(enabledFeatures.has('permissions') && canonical.permissions !== null
      ? {
          permissionRules: buildKimiPermissionRules(canonical.permissions),
          unmanagedDecisions: PERMISSION_LISTS.filter(
            (list) => canonical.permissions?.[list] === undefined,
          ),
        }
      : {}),
  };
}

export const kimiCodeScopeExtras: ScopeExtrasFn = async (
  canonical,
  projectRoot,
  scope,
  enabledFeatures,
) => {
  if (scope !== 'global') return [];
  const owned = ownedConfig(canonical, enabledFeatures);
  if (Object.keys(owned).length === 0) return [];

  const existing = await readFileSafe(join(projectRoot, KIMI_CODE_GLOBAL_CONFIG_FILE));
  const content = serializeKimiConfig(existing, owned);
  if (content === null) return [];

  const result: GenerateResult = {
    target: KIMI_CODE_TARGET,
    path: KIMI_CODE_GLOBAL_CONFIG_FILE,
    content,
    currentContent: existing ?? undefined,
    status: computeStatus(existing, content),
  };
  return [result];
};
