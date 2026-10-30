/**
 * Warp-specific lint hooks.
 *
 * Warp has no hook system at all. Permissions and ignore each have exactly one
 * scope with a real file, so both linters warn only for the scope that cannot
 * be projected. Commands and agents are projected as skills via
 * supportsConversion.
 */

import type { CanonicalFiles, LintDiagnostic } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { createWarning } from '../../core/lint/shared/helpers.js';
import {
  unmappedPermissionEntries,
  regexInterpretedEntries,
  type UnmappedPermissions,
} from './permissions-format.js';
import { WARP_TARGET } from './constants.js';

function scopeOf(options: unknown): TargetLayoutScope | undefined {
  return (options as { scope?: TargetLayoutScope } | undefined)?.scope;
}

/** `allow a, b; deny c` — empty when neither list has entries. */
function describeLists(entries: UnmappedPermissions): string {
  return (['allow', 'deny'] as const)
    .filter((list) => entries[list].length > 0)
    .map((list) => `${list} ${entries[list].join(', ')}`)
    .join('; ');
}

export function lintHooks(canonical: CanonicalFiles): LintDiagnostic[] {
  if (!canonical.hooks) return [];
  const hasEntries = Object.values(canonical.hooks).some(
    (entries) => Array.isArray(entries) && entries.length > 0,
  );
  if (!hasEntries) return [];
  return [
    createWarning(
      '.agentsmesh/hooks.yaml',
      WARP_TARGET,
      'Warp has no lifecycle hook system; canonical hooks are not projected.',
    ),
  ];
}

/**
 * Project scope has no permission file at all — `.warp/.mcp.json` is the only
 * project file Warp reads — so it always warns. Global scope writes
 * `[agents.profiles]` in `~/.warp/settings.toml`, which expresses command
 * allow/deny regexes and a file-read allowlist, so it names every canonical
 * entry with no key to land in, plus every entry whose `Bash(...)` payload Warp
 * reads as a regex instead of a literal command. Canonical `ask` entries need
 * no warning: Warp asks for anything absent from both lists, which is exactly
 * the projection.
 */
export function lintPermissions(canonical: CanonicalFiles, options?: unknown): LintDiagnostic[] {
  if (!canonical.permissions) return [];
  const { allow = [], deny = [], ask = [] } = canonical.permissions;
  if (allow.length === 0 && deny.length === 0 && ask.length === 0) return [];

  if (scopeOf(options) !== 'global') {
    return [
      createWarning(
        '.agentsmesh/permissions.yaml',
        WARP_TARGET,
        'Warp reads agent permissions only from the user-level ~/.warp/settings.toml ([agents.profiles]); there is no project settings file, so canonical permissions are not projected for the project.',
      ),
    ];
  }

  const diagnostics: LintDiagnostic[] = [];
  const unmapped = describeLists(unmappedPermissionEntries(canonical.permissions));
  if (unmapped) {
    diagnostics.push(
      createWarning(
        '.agentsmesh/permissions.yaml',
        WARP_TARGET,
        `Warp [agents.profiles] expresses only command allow/deny regexes (agent_mode_command_execution_allowlist/denylist) and an allowed file-read list (agent_mode_coding_file_read_allowlist) — it has no blanket tool toggles and no read denylist, and a payload that is not a valid regex cannot be written at all; these entries are not projected: ${unmapped}.`,
      ),
    );
  }

  const asRegex = describeLists(regexInterpretedEntries(canonical.permissions));
  if (asRegex) {
    diagnostics.push(
      createWarning(
        '.agentsmesh/permissions.yaml',
        WARP_TARGET,
        `Warp matches agent_mode_command_execution_allowlist/denylist entries as regexes, so these Bash(...) payloads are patterns rather than literal commands ('.' matches any character, '*' repeats the previous token): ${asRegex}.`,
      ),
    );
  }
  return diagnostics;
}

/**
 * Project scope writes `.warpindexingignore`. Global scope has no home-level
 * ignore file — Warp exposes only a GUI indexed-folders control — so canonical
 * patterns are silently dropped there without this warning.
 */
export function lintIgnore(canonical: CanonicalFiles, options?: unknown): LintDiagnostic[] {
  if (canonical.ignore.length === 0) return [];
  if (scopeOf(options) !== 'global') return [];
  return [
    createWarning(
      '.agentsmesh/ignore',
      WARP_TARGET,
      'Warp generates .warpindexingignore for project scope only; globally it exposes just the GUI indexed-folders control, so canonical ignore patterns are not projected.',
    ),
  ];
}
