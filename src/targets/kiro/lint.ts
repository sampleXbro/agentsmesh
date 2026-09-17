/**
 * Kiro-specific lint hooks.
 */

import { AB_PERMISSIONS } from '../../core/canonical-paths.js';
import type { CanonicalFiles, LintDiagnostic } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import {
  createUnsupportedHookWarning,
  createWarning,
  unsupportedHookEventNames,
} from '../../core/lint/shared/helpers.js';
import { unmappedPermissionEntries } from './permissions-lists.js';
import { KIRO_TARGET, KIRO_AGENTS_DIR } from './constants.js';

export function lintHooks(canonical: CanonicalFiles): LintDiagnostic[] {
  if (!canonical.hooks || Object.keys(canonical.hooks).length === 0) return [];
  const supported = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'SubagentStop'] as const;
  return unsupportedHookEventNames(canonical.hooks, supported).map((event) =>
    createUnsupportedHookWarning(event, KIRO_TARGET, supported, { unsupportedBy: 'Kiro hooks' }),
  );
}

/** The project-scope caveat, which depends on whether any agent profile exists. */
function projectScopeMessage(hasAgents: boolean): string {
  const tail =
    'Generate with --global to write the user-scoped .kiro/settings/permissions.yaml instead.';
  if (!hasAgents) {
    return `Kiro has no in-repo project permissions file and canonical defines no agent profiles, so no permission rule is emitted at project scope at all. ${tail}`;
  }
  return `Kiro has no in-repo project permissions file, so permissions are embedded in the ${KIRO_AGENTS_DIR}/ profiles; the same rule set is written into every profile (canonical cannot express per-agent differences) and applies only while one of those agents is active. ${tail}`;
}

/**
 * Three losses to name:
 *  - project scope has no in-repo permissions file, so rules ride along in the
 *    agent profiles, apply only while one of those agents is active, and are
 *    emitted nowhere at all when canonical defines no agents;
 *  - the same rule set lands in every profile, so per-agent scoping is lost;
 *  - entries with no Kiro capability (or a payload on a capability whose
 *    `match` list takes no canonical pattern) are dropped entirely.
 */
export function lintPermissions(canonical: CanonicalFiles, options?: unknown): LintDiagnostic[] {
  if (!canonical.permissions) return [];
  const unmapped = unmappedPermissionEntries(canonical.permissions);
  const dropped = [...unmapped.deny, ...unmapped.ask, ...unmapped.allow];
  const { allow, deny } = canonical.permissions;
  const ask = canonical.permissions.ask ?? [];
  if (allow.length === 0 && deny.length === 0 && ask.length === 0) return [];

  const scope = (options as { scope?: TargetLayoutScope } | undefined)?.scope;
  const diagnostics: LintDiagnostic[] = [];
  if (scope !== 'global') {
    diagnostics.push(
      createWarning(AB_PERMISSIONS, KIRO_TARGET, projectScopeMessage(canonical.agents.length > 0)),
    );
  }
  if (dropped.length > 0) {
    diagnostics.push(
      createWarning(
        AB_PERMISSIONS,
        KIRO_TARGET,
        `Kiro has no rule for ${dropped.join(', ')}; those entries are dropped. Kiro scopes patterns to the fs_read, fs_write and shell capabilities only.`,
      ),
    );
  }
  return diagnostics;
}
