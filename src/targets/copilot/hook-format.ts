/**
 * Build the `hooks` object of a Copilot hooks JSON config — shared by project
 * `.github/hooks/agentsmesh.json` and global `.copilot/hooks/agentsmesh.json`
 * (same `{version, hooks}` schema per
 * docs.github.com/en/copilot/reference/hooks-configuration).
 */

import type { CanonicalFiles } from '../../core/types.js';
import { COPILOT_HOOKS_DIR } from './constants.js';
import { hasHookCommand } from '../../core/hook-command.js';
import type { RulesOutput } from './generator.js';

function mapHookEvent(event: string): string | null {
  switch (event) {
    case 'PreToolUse':
      return 'preToolUse';
    case 'PostToolUse':
      return 'postToolUse';
    case 'Notification':
      return 'notification';
    case 'UserPromptSubmit':
      return 'userPromptSubmitted';
    default:
      return null;
  }
}

/**
 * Emits the real top-level `matcher` regex field (omitted for the canonical
 * `'*'`/empty wildcard sentinel, since Copilot compiles `matcher` as
 * `^(?:PATTERN)$` and an invalid regex causes the whole hook entry to be
 * skipped — "*" alone is not a valid regex).
 * Returns null when there is nothing to emit.
 */
export function buildCopilotHooksObject(
  hooks: CanonicalFiles['hooks'],
): Record<string, unknown> | null {
  if (!hooks) return null;
  const result = Object.fromEntries(
    Object.entries(hooks).flatMap(([event, entries]) => {
      const mappedEvent = mapHookEvent(event);
      if (!mappedEvent || !Array.isArray(entries)) return [];
      const mappedEntries = entries
        .filter(
          (entry): entry is NonNullable<typeof entry> =>
            typeof entry === 'object' && entry !== null && hasHookCommand(entry),
        )
        .map((entry, index) => {
          const safePhase = event.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
          const hook: Record<string, unknown> = {
            type: 'command',
            bash: `./scripts/${safePhase}-${index}.sh`,
          };
          if (entry.matcher && entry.matcher !== '*') hook.matcher = entry.matcher;
          if (entry.timeout !== undefined) hook.timeoutSec = Math.ceil(entry.timeout / 1000);
          return hook;
        });
      return mappedEntries.length > 0 ? [[mappedEvent, mappedEntries] as const] : [];
    }),
  );
  return Object.keys(result).length > 0 ? result : null;
}

/** Generate .github/hooks/agentsmesh.json (project scope) from canonical hooks. */
export function generateHooks(canonical: CanonicalFiles): RulesOutput[] {
  const hooks = buildCopilotHooksObject(canonical.hooks);
  if (!hooks) return [];
  return [
    {
      path: `${COPILOT_HOOKS_DIR}/agentsmesh.json`,
      content: JSON.stringify({ version: 1, hooks }, null, 2),
    },
  ];
}
