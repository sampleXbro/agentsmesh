/**
 * Build the `hooks` object of a Copilot hooks JSON config — shared by project
 * `.github/hooks/agentsmesh.json` and global `.copilot/hooks/agentsmesh.json`
 * (same `{version, hooks}` schema per
 * docs.github.com/en/copilot/reference/hooks-configuration).
 */

import type { CanonicalFiles, HookEntry } from '../../core/types.js';
import { COPILOT_HOOKS_DIR } from './constants.js';
import { hasHookCommand } from '../../core/hook-command.js';
import type { RulesOutput } from './generator.js';

/**
 * Events whose output reaches the model: `additionalContext` on sessionStart,
 * postToolUse and postToolUseFailure. preToolUse output is only
 * permissionDecision/permissionDecisionReason/modifiedArgs, and config-file
 * userPromptSubmitted output is dropped (docs.github.com/en/copilot/reference/hooks-configuration).
 */
export const COPILOT_HOOK_CONTEXT_EVENTS: readonly string[] = [
  'SessionStart',
  'PostToolUse',
  'PostToolUseFailure',
];

export const CANONICAL_TO_COPILOT: ReadonlyMap<string, string> = new Map([
  ['PreToolUse', 'preToolUse'],
  ['PostToolUse', 'postToolUse'],
  ['PostToolUseFailure', 'postToolUseFailure'],
  ['Notification', 'notification'],
  ['UserPromptSubmit', 'userPromptSubmitted'],
  ['SessionStart', 'sessionStart'],
]);

export interface CopilotHookGroup {
  /** Canonical event; it names the wrapper scripts. */
  readonly event: string;
  readonly copilotEvent: string;
  readonly entries: readonly HookEntry[];
}

/**
 * The hook entries Copilot receives, per event: no unmapped events, no entries
 * without a command. The hooks config and the wrapper scripts both come from
 * this, so they always match.
 */
export function copilotHookGroups(hooks: CanonicalFiles['hooks']): CopilotHookGroup[] {
  return Object.entries(hooks ?? {}).flatMap(([event, entries]) => {
    const copilotEvent = CANONICAL_TO_COPILOT.get(event);
    if (!copilotEvent || !Array.isArray(entries)) return [];
    const kept = entries.filter(
      (entry): entry is HookEntry =>
        typeof entry === 'object' && entry !== null && hasHookCommand(entry),
    );
    return kept.length > 0 ? [{ event, copilotEvent, entries: kept }] : [];
  });
}

/** Wrapper script file name for the `index`-th entry of a canonical event. */
export function wrapperScriptName(event: string, index: number): string {
  return `${event.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}-${index}.sh`;
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
  const groups = copilotHookGroups(hooks);
  if (groups.length === 0) return null;
  return Object.fromEntries(
    groups.map(({ event, copilotEvent, entries }) => [
      copilotEvent,
      entries.map((entry, index) => {
        const hook: Record<string, unknown> = {
          type: 'command',
          bash: `./scripts/${wrapperScriptName(event, index)}`,
        };
        if (entry.matcher && entry.matcher !== '*') hook.matcher = entry.matcher;
        if (entry.timeout !== undefined) hook.timeoutSec = Math.ceil(entry.timeout / 1000);
        return hook;
      }),
    ]),
  );
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
