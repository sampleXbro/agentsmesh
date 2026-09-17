/**
 * Aider-specific lint hooks.
 *
 * Aider supports MCP and permissions through no config file at all, and its
 * hook surface is five fixed `.aider.conf.yml` keys rather than a general
 * lifecycle mechanism — so `lintHooks` names every canonical entry that has no
 * key to land in, plus the ones aider narrows. Commands and agents are
 * projected as skills via supportsConversion.
 */

import { unsupportedFeature } from '../../core/lint/capability-gap.js';
import type { CanonicalFiles, LintDiagnostic } from '../../core/types.js';
import { createWarning } from '../../core/lint/shared/helpers.js';
import { projectAiderHooks, type AiderHookEntry } from './hooks-format.js';

const HOOKS_FILE = '.agentsmesh/hooks.yaml';

/** `PostToolUse(Bash): audit` — one readable item per dropped entry. */
function describeEntries(entries: readonly AiderHookEntry[]): string {
  return entries
    .map((entry) => `${entry.event}(${entry.matcher || '*'}): ${entry.command}`)
    .join(', ');
}

export function lintHooks(canonical: CanonicalFiles): LintDiagnostic[] {
  const { unmapped, narrowed } = projectAiderHooks(canonical.hooks);
  const diagnostics: LintDiagnostic[] = [];
  if (unmapped.length > 0) {
    diagnostics.push(
      createWarning(
        HOOKS_FILE,
        'aider',
        'Aider has no lifecycle hook system — only lint-cmd (run on the files it edits), ' +
          'test-cmd (run after it edits code) and notifications-command, each holding one ' +
          `command; these canonical hooks are not projected: ${describeEntries(unmapped)}.`,
      ),
    );
  }
  if (narrowed.length > 0) {
    diagnostics.push(
      createWarning(
        HOOKS_FILE,
        'aider',
        'Aider runs test-cmd only after it edits code, not after every tool use, and treats ' +
          'its output as test failures; these unscoped hooks are projected with that narrower ' +
          `meaning: ${describeEntries(narrowed)}.`,
      ),
    );
  }
  return diagnostics;
}

export const lintPermissions = unsupportedFeature(
  'permissions',
  'aider',
  'Aider has no permissions config; canonical permissions are not projected.',
);

export const lintMcp = unsupportedFeature(
  'mcp',
  'aider',
  'Aider has no MCP config file; canonical MCP servers are not projected.',
);
