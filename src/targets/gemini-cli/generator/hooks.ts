import type { Hooks } from '../../../core/types.js';
import { getHookCommand, hasHookCommand } from '../../../core/hook-command.js';
import { projectRecallHooks } from '../../projection/recall-hooks.js';
import { GEMINI_HOOK_CONTEXT_EVENTS, geminiHookEvent, toGeminiMatcher } from '../hook-map.js';

export interface GeminiHookDefinition {
  readonly matcher: string | undefined;
  readonly hooks: ReadonlyArray<{
    readonly name: string;
    readonly type: 'command';
    readonly command: string;
    readonly timeout: number | undefined;
  }>;
}

/**
 * The `hooks` object of `.gemini/settings.json`, or null when empty. The recall
 * hook is kept only where Gemini injects context; canonical events that share a
 * Gemini event (UserPromptSubmit, SubagentStart -> BeforeAgent) are merged.
 */
export function buildGeminiHooks(
  hooks: Hooks | null | undefined,
): Record<string, GeminiHookDefinition[]> | null {
  const projected = projectRecallHooks(hooks, GEMINI_HOOK_CONTEXT_EVENTS) ?? {};
  const result: Record<string, GeminiHookDefinition[]> = {};
  for (const [event, entries] of Object.entries(projected)) {
    const geminiEvent = geminiHookEvent(event);
    if (!geminiEvent || !Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (typeof entry !== 'object' || entry === null || !hasHookCommand(entry)) continue;
      const list = (result[geminiEvent] ??= []);
      list.push({
        matcher:
          typeof entry.matcher === 'string'
            ? toGeminiMatcher(geminiEvent, entry.matcher)
            : entry.matcher,
        hooks: [
          {
            name: `${geminiEvent}-${list.length + 1}`,
            type: 'command',
            command: getHookCommand(entry),
            timeout: entry.timeout,
          },
        ],
      });
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}
