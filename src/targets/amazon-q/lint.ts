/**
 * Amazon Q Developer-specific lint hooks.
 *
 * Hooks (embedded): PreToolUse, PostToolUse, and UserPromptSubmit are embedded
 * into each agent JSON; Notification, SubagentStart, and SubagentStop have no
 * Amazon Q equivalent and emit warnings.
 *
 * Permissions (embedded): allow is embedded into each agent JSON as allowedTools;
 * deny and ask have no Amazon Q equivalent and emit a warning.
 *
 * Ignore lives in `lint-ignore.ts` and is re-exported here for the descriptor.
 */

import type { CanonicalFiles, LintDiagnostic } from '../../core/types.js';
import { createWarning } from '../../core/lint/shared/helpers.js';
import { amazonQPromptName } from './generator.js';

export { lintIgnore } from './lint-ignore.js';

/**
 * Q prompt files are plain markdown bodies read verbatim, so command metadata is
 * dropped, and `validate_prompt_name` forces names into `^[a-zA-Z0-9_-]{1,50}$`.
 */
export function lintCommands(canonical: CanonicalFiles): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];

  // Prompt files are flat, so two canonical names can sanitize onto one file and
  // silently overwrite each other.
  const byPromptName = new Map<string, string[]>();
  for (const command of canonical.commands) {
    const key = amazonQPromptName(command.name);
    byPromptName.set(key, [...(byPromptName.get(key) ?? []), command.source]);
  }
  for (const [promptName, sources] of byPromptName) {
    if (sources.length < 2) continue;
    for (const source of sources) {
      diagnostics.push(
        createWarning(
          source,
          'amazon-q',
          `${sources.length} commands resolve to the same Amazon Q prompt file ` +
            `"${promptName}.md"; only the last one generated survives.`,
        ),
      );
    }
  }

  for (const command of canonical.commands) {
    const renamed = amazonQPromptName(command.name);
    if (renamed !== command.name) {
      diagnostics.push(
        createWarning(
          command.source,
          'amazon-q',
          `Amazon Q prompt names allow only [a-zA-Z0-9_-] up to 50 characters; ` +
            `"${command.name}" is written as "${renamed}.md".`,
        ),
      );
      continue;
    }
    if (command.description || command.allowedTools.length > 0) {
      diagnostics.push(
        createWarning(
          command.source,
          'amazon-q',
          'Amazon Q prompt files are plain markdown read verbatim; ' +
            'description and allowed-tools metadata are not projected.',
        ),
      );
    }
  }
  return diagnostics;
}

/** Amazon Q canonical event names that are embeddable into agent JSON. */
const AQ_EMBEDDABLE_EVENTS: ReadonlySet<string> = new Set([
  'PreToolUse',
  'PostToolUse',
  'UserPromptSubmit',
]);

export function lintHooks(canonical: CanonicalFiles): LintDiagnostic[] {
  if (!canonical.hooks) return [];
  const unmappedEvents: string[] = [];
  for (const [event, entries] of Object.entries(canonical.hooks)) {
    if (!Array.isArray(entries) || entries.length === 0) continue;
    if (!AQ_EMBEDDABLE_EVENTS.has(event)) {
      unmappedEvents.push(event);
    }
  }
  if (unmappedEvents.length === 0) return [];
  return [
    createWarning(
      '.agentsmesh/hooks.yaml',
      'amazon-q',
      `Amazon Q CLI has no equivalent for hook event(s) ${unmappedEvents.join(', ')}; ` +
        'only PreToolUse, PostToolUse, and UserPromptSubmit are embedded in agent JSON.',
    ),
  ];
}

export function lintPermissions(canonical: CanonicalFiles): LintDiagnostic[] {
  if (!canonical.permissions) return [];
  const { deny = [], ask = [] } = canonical.permissions;
  // allow maps cleanly to allowedTools in agent JSON — no warning needed.
  if (deny.length === 0 && ask.length === 0) return [];
  return [
    createWarning(
      '.agentsmesh/permissions.yaml',
      'amazon-q',
      'Amazon Q CLI has no equivalent for permissions deny/ask lists; ' +
        'only allow is embedded in agent JSON as allowedTools.',
    ),
  ];
}
