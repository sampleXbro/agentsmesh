/**
 * Gemini CLI-specific lint hooks.
 */

import type { CanonicalFiles, LintDiagnostic } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import {
  createWarning,
  createUnsupportedHookWarning,
  unsupportedHookEventNames,
} from '../../core/lint/shared/helpers.js';
import { CANONICAL_TO_GEMINI } from './hook-map.js';

export function lintCommands(canonical: CanonicalFiles): LintDiagnostic[] {
  return canonical.commands
    .filter((command) => command.allowedTools.length > 0)
    .map((command) =>
      createWarning(
        command.source,
        'gemini-cli',
        'Gemini TOML command files do not project canonical allowed-tools metadata.',
      ),
    );
}

export function lintPermissions(canonical: CanonicalFiles, options?: unknown): LintDiagnostic[] {
  if (!canonical.permissions) return [];
  const { allow, deny } = canonical.permissions;
  const ask = canonical.permissions.ask ?? [];
  if (allow.length === 0 && deny.length === 0 && ask.length === 0) return [];

  const scope = (options as { scope?: TargetLayoutScope } | undefined)?.scope;
  // The policy engine loads the User tier but its Workspace tier is non-functional
  // upstream, so a project-scope policy file would never be read.
  if (scope !== 'global') {
    return [
      createWarning(
        '.agentsmesh/permissions.yaml',
        'gemini-cli',
        'Gemini CLI ignores workspace-tier policies (.gemini/policies/); generate with --global to write ~/.gemini/policies/permissions.toml instead.',
      ),
    ];
  }
  // Globally the file is written, but only allow/deny map to policy rules.
  if (ask.length === 0) return [];
  return [
    createWarning(
      '.agentsmesh/permissions.yaml',
      'gemini-cli',
      'Gemini policy rules are generated from allow/deny only; ask entries are not projected.',
    ),
  ];
}

export function lintHooks(canonical: CanonicalFiles): LintDiagnostic[] {
  if (!canonical.hooks || Object.keys(canonical.hooks).length === 0) return [];
  const supported = [...CANONICAL_TO_GEMINI.keys()];
  return unsupportedHookEventNames(canonical.hooks, supported).map((event) =>
    createUnsupportedHookWarning(event, 'gemini-cli', supported),
  );
}
