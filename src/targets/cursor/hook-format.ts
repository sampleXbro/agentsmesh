/**
 * Cursor hooks event-name + shape mapping.
 *
 * Cursor's `.cursor/hooks.json` uses camelCase event names and a FLAT array of
 * hook objects per event (`{ command, type?, matcher?, timeout? }`) — NOT the
 * Claude-style nested `{ matcher, hooks: [...] }` shape. Canonical hooks use
 * Claude-style PascalCase event names, so both directions are mapped here.
 */

import { isBestEffortHookEvent } from '../../core/hook-types.js';
import type { HookEntry, Hooks } from '../../core/types.js';
import { getHookText, hasHookText } from '../../core/hook-command.js';

/** Canonical (Claude-style) event name -> Cursor camelCase event name. */
const CANONICAL_TO_CURSOR = {
  PreToolUse: 'preToolUse',
  PostToolUse: 'postToolUse',
  PostToolUseFailure: 'postToolUseFailure',
  UserPromptSubmit: 'beforeSubmitPrompt',
  SubagentStart: 'subagentStart',
  SubagentStop: 'subagentStop',
  Stop: 'stop',
  SessionStart: 'sessionStart',
  SessionEnd: 'sessionEnd',
  PreCompact: 'preCompact',
} as const;

/**
 * Events whose output Cursor feeds to the model: `additional_context` on
 * sessionStart, postToolUse and postToolUseFailure. preToolUse output is only
 * permission/user_message/agent_message/updated_input, and beforeSubmitPrompt
 * only continue/user_message (cursor.com/docs/agent/hooks).
 */
export const CURSOR_HOOK_CONTEXT_EVENTS: readonly string[] = [
  'SessionStart',
  'PostToolUse',
  'PostToolUseFailure',
];

const CURSOR_TO_CANONICAL = new Map<string, string>(
  Object.entries(CANONICAL_TO_CURSOR).map(([canonical, cursor]) => [cursor, canonical]),
);

export interface CursorHook {
  type: 'command' | 'prompt';
  command?: string;
  prompt?: string;
  matcher?: string;
  timeout?: number;
}

/**
 * Canonical event names Cursor cannot represent — dropped on generate. Excludes
 * BEST_EFFORT_HOOK_EVENTS while they carry only the agentsmesh-injected recall
 * hook: dropping that is not user data loss, so warning would be permanent and unfixable.
 */
export function unmappedCursorHookEvents(hooks: Hooks): string[] {
  return Object.keys(hooks).filter(
    (event) =>
      Array.isArray(hooks[event]) &&
      (hooks[event] as HookEntry[]).length > 0 &&
      !(event in CANONICAL_TO_CURSOR) &&
      !isBestEffortHookEvent(event, hooks[event]),
  );
}

/** Canonical hooks -> Cursor `hooks` object (camelCase events, flat arrays). */
export function toCursorHooks(hooks: Hooks): Record<string, CursorHook[]> {
  const result: Record<string, CursorHook[]> = {};
  for (const [event, entries] of Object.entries(hooks)) {
    const cursorEvent = CANONICAL_TO_CURSOR[event as keyof typeof CANONICAL_TO_CURSOR];
    if (!cursorEvent || !Array.isArray(entries)) continue;
    const flat: CursorHook[] = [];
    for (const entry of entries) {
      if (!hasHookText(entry)) continue;
      const value = getHookText(entry);
      const hook: CursorHook =
        entry.type === 'prompt'
          ? { type: 'prompt', prompt: value }
          : { type: 'command', command: value };
      if (entry.matcher) hook.matcher = entry.matcher;
      if (entry.timeout !== undefined) hook.timeout = entry.timeout;
      flat.push(hook);
    }
    if (flat.length > 0) result[cursorEvent] = flat;
  }
  return result;
}

/** Cursor `hooks` object -> canonical hooks (PascalCase events). */
export function cursorHooksToCanonical(hooks: Record<string, unknown>): Hooks {
  const result: Hooks = {};
  for (const [cursorEvent, entries] of Object.entries(hooks)) {
    const canonicalEvent = CURSOR_TO_CANONICAL.get(cursorEvent);
    if (!canonicalEvent || !Array.isArray(entries)) continue;
    const list: HookEntry[] = [];
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const type = e.type === 'prompt' ? 'prompt' : 'command';
      if (!hasHookText({ ...e, type })) continue;
      const value = getHookText({ ...e, type });
      const item: HookEntry = {
        matcher: typeof e.matcher === 'string' ? e.matcher : '',
        type,
        command: value,
      };
      if (typeof e.timeout === 'number') item.timeout = e.timeout;
      list.push(item);
    }
    if (list.length > 0) result[canonicalEvent] = [...(result[canonicalEvent] ?? []), ...list];
  }
  return result;
}
