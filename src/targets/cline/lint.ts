/**
 * Cline-specific lint hooks.
 */

import { unsupportedFeature } from '../../core/lint/capability-gap.js';
import type { CanonicalFiles, LintDiagnostic } from '../../core/types.js';
import { createWarning } from '../../core/lint/shared/helpers.js';

export function lintCommands(canonical: CanonicalFiles): LintDiagnostic[] {
  return canonical.commands
    .filter((command) => command.description.length > 0 || command.allowedTools.length > 0)
    .map((command) =>
      createWarning(
        command.source,
        'cline',
        'cline workflow files are plain Markdown; command description and allowed-tools metadata are not projected.',
      ),
    );
}

export const lintHooks = unsupportedFeature(
  'hooks',
  'cline',
  'cline hooks are emitted as .cline/hooks/*.sh wrapper scripts with a `#!/usr/bin/env bash` header; they require a POSIX shell (git-bash or WSL) to execute on Windows.',
);

export function lintPermissions(canonical: CanonicalFiles): LintDiagnostic[] {
  if (!canonical.permissions) return [];
  const { allow, deny } = canonical.permissions;
  const ask = canonical.permissions.ask ?? [];
  if (allow.length === 0 && deny.length === 0 && ask.length === 0) return [];
  return [
    createWarning(
      '.agentsmesh/permissions.yaml',
      'cline',
      'cline has no dedicated permissions file in either scope; canonical allow/deny/ask rules are not projected. ' +
        'Approval is controlled via the --auto-approve CLI flag, the CLINE_COMMAND_PERMISSIONS environment variable ' +
        "(JSON allow/deny command-glob policy), or the extension UI's Auto Approve / YOLO Mode — set these directly.",
    ),
  ];
}
