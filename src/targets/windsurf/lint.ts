/**
 * Windsurf-specific lint hooks.
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
        'windsurf',
        'windsurf workflow files are plain Markdown; command description and allowed-tools metadata are not projected.',
      ),
    );
}

export const lintMcp = unsupportedFeature(
  'mcp',
  'windsurf',
  'Windsurf MCP is partial; generated .windsurf/mcp_config.example.json is a reference artifact and may require manual setup.',
);

export const lintPermissions = unsupportedFeature(
  'permissions',
  'windsurf',
  'Windsurf terminal permissions (auto-execution, command allow/deny lists) are managed via user settings UI; agentsmesh does not generate permissions config.',
);

const WILDCARD_MATCHERS = new Set(['', '*', '.*']);

/** Windsurf hook entries have no matcher: a tool-scoped canonical hook runs on every event. */
export function lintHooks(canonical: CanonicalFiles): LintDiagnostic[] {
  if (!canonical.hooks) return [];
  const diagnostics: LintDiagnostic[] = [];
  for (const [event, entries] of Object.entries(canonical.hooks)) {
    for (const entry of entries ?? []) {
      if (WILDCARD_MATCHERS.has(entry.matcher.trim())) continue;
      diagnostics.push(
        createWarning(
          '.agentsmesh/hooks.yaml',
          'windsurf',
          `Windsurf hooks have no matcher field; ${event} hook "${entry.command}" runs on every ${event} event (matcher "${entry.matcher}" is not projected).`,
        ),
      );
    }
  }
  return diagnostics;
}
