/**
 * Windsurf `.windsurf/hooks.json` event names <-> canonical hook events.
 * Windsurf spells events in snake_case; one table drives both directions so
 * import is the exact inverse of generate and unknown events never leak into
 * canonical `hooks.yaml` as dead keys.
 */

import { BEST_EFFORT_HOOK_EVENTS } from '../../core/hook-types.js';

/** Every canonical event agentsmesh knows (the `Hooks` keys plus the best-effort scaffold). */
export const KNOWN_CANONICAL_HOOK_EVENTS: readonly string[] = [
  'PreToolUse',
  'PostToolUse',
  'Notification',
  'UserPromptSubmit',
  'SubagentStart',
  'SubagentStop',
  ...BEST_EFFORT_HOOK_EVENTS,
];

/**
 * Windsurf hooks report only through exit codes: stdout goes to the Cascade UI
 * and only an exit-2 stderr reaches the agent, while blocking the action
 * (docs.windsurf.com/windsurf/cascade/hooks). No event injects context.
 */
export const WINDSURF_HOOK_CONTEXT_EVENTS: readonly string[] = [];

export function windsurfEventName(event: string): string {
  return event
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase();
}

const WINDSURF_TO_CANONICAL: ReadonlyMap<string, string> = new Map(
  KNOWN_CANONICAL_HOOK_EVENTS.map((event) => [windsurfEventName(event), event]),
);

/**
 * Canonical name for a Windsurf event, or `null` when agentsmesh has no such
 * event. Canonical names are accepted as-is (legacy cursor-style hooks.json).
 */
export function canonicalHookEventName(event: string): string | null {
  if (KNOWN_CANONICAL_HOOK_EVENTS.includes(event)) return event;
  return WINDSURF_TO_CANONICAL.get(event) ?? null;
}
