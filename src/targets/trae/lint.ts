/**
 * Trae-specific lint hooks.
 *
 * Permissions have exactly one scope with a real file — the user-level
 * `~/.trae/permission/global.json` — so the project scope always warns, and the
 * global scope names every canonical entry with no key to land in.
 */

import type { CanonicalFiles, LintDiagnostic } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { createWarning } from '../../core/lint/shared/helpers.js';
import {
  mappedPermissionEntries,
  unmappedPermissionEntries,
  type UnmappedPermissions,
} from './permissions-format.js';
import { TRAE_TARGET } from './constants.js';

const PERMISSIONS_FILE = '.agentsmesh/permissions.yaml';

function scopeOf(options: unknown): TargetLayoutScope | undefined {
  return (options as { scope?: TargetLayoutScope } | undefined)?.scope;
}

/** `allow a, b; deny c` — empty when no list has entries. */
function describeLists(entries: UnmappedPermissions): string {
  return (['allow', 'deny', 'ask'] as const)
    .filter((list) => entries[list].length > 0)
    .map((list) => `${list} ${entries[list].join(', ')}`)
    .join('; ');
}

export function lintPermissions(canonical: CanonicalFiles, options?: unknown): LintDiagnostic[] {
  if (!canonical.permissions) return [];
  const { allow = [], deny = [], ask = [] } = canonical.permissions;
  if (allow.length === 0 && deny.length === 0 && ask.length === 0) return [];

  if (scopeOf(options) !== 'global') {
    return [
      createWarning(
        PERMISSIONS_FILE,
        TRAE_TARGET,
        'Trae keeps every permission rule in the user-level ~/.trae/permission/global.json, ' +
          'including per-workspace paths (written there with $WORKSPACE_FOLDER); there is no ' +
          'project permission file, so canonical permissions are not projected for the project. ' +
          'Run `agentsmesh generate --global` to write them instead.',
      ),
    ];
  }

  const diagnostics: LintDiagnostic[] = [];
  const unmapped = describeLists(unmappedPermissionEntries(canonical.permissions));
  if (unmapped) {
    diagnostics.push(
      createWarning(
        PERMISSIONS_FILE,
        TRAE_TARGET,
        'Trae global.json expresses shell commands (approval.commandRules) and authorized file ' +
          'paths (resourceAuthorization.filesystem.readWrite/readOnly) — it has no blanket tool ' +
          'toggles, no MCP-tool patterns derived from canonical entries, and no filesystem deny ' +
          `or ask list; these entries are not projected: ${unmapped}.`,
      ),
    );
  }

  const mapped = describeLists(mappedPermissionEntries(canonical.permissions));
  if (mapped) {
    diagnostics.push(
      createWarning(
        PERMISSIONS_FILE,
        TRAE_TARGET,
        'Trae writes ~/.trae/permission/global.json itself (folder grants, "Add to allowlist"), ' +
          'so agentsmesh only adds to it: removing one of these entries from canonical does NOT ' +
          'remove it from global.json — delete it in Trae or edit the file by hand; these ' +
          `entries are added and never revoked: ${mapped}.`,
      ),
    );
  }
  return diagnostics;
}
