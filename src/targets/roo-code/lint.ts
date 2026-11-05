import type { CanonicalFiles, LintDiagnostic } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { createWarning } from '../../core/lint/shared/helpers.js';

/**
 * Project scope: `.vscode/settings.json` covers command-prefix allow/deny only
 * (roo-cline.allowedCommands/deniedCommands) — warn when canonical "ask" rules
 * exist, since Roo Code has no equivalent bucket to project them into.
 * Global scope: no deterministic VS Code user-settings path exists within
 * `--global`'s single root, so any permissions must be configured manually.
 */
export function lintPermissions(canonical: CanonicalFiles, options?: unknown): LintDiagnostic[] {
  if (!canonical.permissions) return [];
  const { allow = [], deny = [], ask = [] } = canonical.permissions;
  const scope = (options as { scope?: TargetLayoutScope } | undefined)?.scope;

  if (scope === 'global') {
    if (allow.length === 0 && deny.length === 0 && ask.length === 0) return [];
    return [
      createWarning(
        '.agentsmesh/permissions.yaml',
        'roo-code',
        'Roo Code permissions (roo-cline.allowedCommands/deniedCommands) are only generated for project scope (.vscode/settings.json); global scope has no deterministic VS Code user-settings path and must be configured via the VS Code Settings UI.',
      ),
    ];
  }

  if (ask.length === 0) return [];
  return [
    createWarning(
      '.agentsmesh/permissions.yaml',
      'roo-code',
      'Roo Code has no "ask" permission concept (only roo-cline.allowedCommands/deniedCommands); ask rules are not projected into .vscode/settings.json.',
    ),
  ];
}

/**
 * Roo Code's RooIgnoreController only ever reads `.rooignore` from the open
 * workspace (`path.join(cwd, '.rooignore')`); there is no home-directory /
 * global ignore concept, so global scope silently drops canonical ignore
 * patterns without this warning.
 */
export function lintIgnore(canonical: CanonicalFiles, options?: unknown): LintDiagnostic[] {
  const scope = (options as { scope?: TargetLayoutScope } | undefined)?.scope;
  if (scope !== 'global') return [];
  if (canonical.ignore.length === 0) return [];
  return [
    createWarning(
      '.agentsmesh/ignore',
      'roo-code',
      'Roo Code has no home-directory/global ignore concept (.rooignore is workspace-only); canonical ignore patterns are not projected in global scope.',
    ),
  ];
}
