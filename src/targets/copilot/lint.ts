/**
 * Copilot-specific lint hooks.
 */

import type { CanonicalFiles, LintDiagnostic } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import {
  createWarning,
  createUnsupportedHookWarning,
  unsupportedHookEventNames,
} from '../../core/lint/shared/helpers.js';
import { CANONICAL_TO_COPILOT } from './hook-format.js';

/**
 * Copilot CLI's `~/.copilot/permissions-config.json` only records saved
 * tool/directory approval decisions — per docs.github.com/en/copilot/reference/
 * copilot-cli-reference/cli-config-dir-reference, it "doesn't support deny
 * rules, 'ask' rules, default modes, URL rules, tool filtering, or
 * repository-local shared policy." Global scope is capped at 'partial'; this
 * warns instead of generating a file that would overclaim control. There is
 * no project-scope permissions surface at all (capability stays 'none').
 */
export function lintPermissions(canonical: CanonicalFiles, options?: unknown): LintDiagnostic[] {
  const scope = (options as { scope?: TargetLayoutScope } | undefined)?.scope;
  if (scope !== 'global') return [];
  if (!canonical.permissions) return [];
  const { allow, deny } = canonical.permissions;
  const ask = canonical.permissions.ask ?? [];
  if (allow.length === 0 && deny.length === 0 && ask.length === 0) return [];
  return [
    createWarning(
      '.agentsmesh/permissions.yaml',
      'copilot',
      'Copilot permissions are embedded via hooks permissionRequest and pre-tool allow/deny/ask decisions; standalone permissions config is not generated separately.',
    ),
  ];
}

export function lintCommands(canonical: CanonicalFiles): LintDiagnostic[] {
  return canonical.commands
    .filter((command) => command.allowedTools.length > 0)
    .map((command) =>
      createWarning(
        command.source,
        'copilot',
        'Copilot prompt files do not enforce canonical allowed-tools natively.',
      ),
    );
}

export function lintHooks(canonical: CanonicalFiles): LintDiagnostic[] {
  if (!canonical.hooks || Object.keys(canonical.hooks).length === 0) return [];
  const supported = [...CANONICAL_TO_COPILOT.keys()];
  const diagnostics: LintDiagnostic[] = unsupportedHookEventNames(canonical.hooks, supported).map(
    (event) =>
      createUnsupportedHookWarning(event, 'copilot', supported, {
        unsupportedBy: 'Copilot hooks',
      }),
  );
  const hasEntries = Object.values(canonical.hooks).some(
    (entries) => Array.isArray(entries) && entries.length > 0,
  );
  if (hasEntries) {
    diagnostics.push(
      createWarning(
        '.agentsmesh/hooks.yaml',
        'copilot',
        'copilot hooks are emitted as .github/hooks/scripts/*.sh wrapper scripts with a `#!/usr/bin/env bash` header; they require a POSIX shell (git-bash or WSL) to execute on Windows.',
      ),
    );
  }
  return diagnostics;
}
