/**
 * Deep Agents CLI-specific lint functions.
 *
 * Deep Agents CLI does not support ignore as a standalone config file.
 * Commands are projected as skills via supportsConversion. Agents are natively
 * supported via `.deepagents/agents/{name}/AGENTS.md`. Hooks and permissions
 * have no project-level surface at all (only global `~/.deepagents/hooks.json`
 * and `~/.deepagents/config.toml` — see `global-hooks.ts` and
 * `global-permissions.ts`).
 */

import { unsupportedFeature } from '../../core/lint/capability-gap.js';
import type { CanonicalFiles, LintDiagnostic } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { createWarning } from '../../core/lint/shared/helpers.js';
import { unmappedDeepagentsHookEvents } from './hooks-format.js';
import { unmappedPermissionEntries } from './permissions-format.js';

/**
 * Project scope has no permission surface at all, so it always warns. Global
 * scope writes `shell.allow_list` in `~/.deepagents/config.toml`, which holds
 * only shell-command allow entries — so it names every canonical entry that
 * cannot be projected (deny, ask, and non-shell allow patterns).
 */
export function lintPermissions(canonical: CanonicalFiles, options?: unknown): LintDiagnostic[] {
  const scope = (options as { scope?: TargetLayoutScope } | undefined)?.scope;
  if (!canonical.permissions) return [];
  const { allow, deny } = canonical.permissions;
  const ask = canonical.permissions.ask ?? [];
  if (allow.length === 0 && deny.length === 0 && ask.length === 0) return [];

  if (scope !== 'global') {
    return [
      createWarning(
        '.agentsmesh/permissions.yaml',
        'deepagents-cli',
        'Deep Agents CLI reads permissions only from the global ~/.deepagents/config.toml (there is no project config tier); canonical permissions are not projected for the project.',
      ),
    ];
  }

  const unmapped = unmappedPermissionEntries(canonical.permissions);
  const parts = (['allow', 'deny', 'ask'] as const)
    .filter((list) => unmapped[list].length > 0)
    .map((list) => `${list} ${unmapped[list].join(', ')}`);
  if (parts.length === 0) return [];
  return [
    createWarning(
      '.agentsmesh/permissions.yaml',
      'deepagents-cli',
      `Deep Agents CLI ~/.deepagents/config.toml expresses only a shell allow list (shell.allow_list) — it has no deny rules, no ask rules, and no per-tool patterns; these entries are not projected: ${parts.join('; ')}.`,
    ),
  ];
}

export const lintIgnore = unsupportedFeature(
  'ignore',
  'deepagents-cli',
  'Deep Agents CLI has no dedicated ignore file and relies on .gitignore; canonical ignore patterns are not projected.',
);

/**
 * Deep Agents CLI has no project-level hooks surface at all, so project scope
 * always warns when any canonical hooks exist. Global scope has a real
 * surface (`~/.deepagents/hooks.json`) but only supports a handful of
 * lifecycle events, so it warns only about the specific events with no
 * Deep Agents equivalent (dropped on generate — see `hooks-format.ts`).
 */
export function lintHooks(canonical: CanonicalFiles, options?: unknown): LintDiagnostic[] {
  const scope = (options as { scope?: TargetLayoutScope } | undefined)?.scope;
  if (!canonical.hooks) return [];
  if (scope !== 'global') {
    const hasEntries = Object.values(canonical.hooks).some(
      (entries) => Array.isArray(entries) && entries.length > 0,
    );
    if (!hasEntries) return [];
    return [
      createWarning(
        '.agentsmesh/hooks.yaml',
        'deepagents-cli',
        'Deep Agents CLI has no project-level hooks surface (only global ~/.deepagents/hooks.json, docs.langchain.com/oss/javascript/deepagents/code/hooks); canonical hooks are not projected for the project.',
      ),
    ];
  }
  const unmapped = unmappedDeepagentsHookEvents(canonical.hooks);
  if (unmapped.length === 0) return [];
  return [
    createWarning(
      '.agentsmesh/hooks.yaml',
      'deepagents-cli',
      `Deep Agents CLI has no equivalent for hook event(s) ${unmapped.join(', ')}; they are not projected to ~/.deepagents/hooks.json.`,
    ),
  ];
}
