import type { HookEntry, Hooks } from '../../core/types.js';
import { isRecallHookCommand } from '../../lessons/recall-hook-scaffold.js';

function isRecallEntry(entry: HookEntry | null | undefined): boolean {
  return typeof entry?.command === 'string' && isRecallHookCommand(entry.command);
}

/**
 * Keep the lessons recall hook only on `contextEvents` (a target's
 * `hookContextEvents`); every user hook passes through. An event left empty is
 * dropped. `undefined` keeps everything, for targets that declare nothing.
 */
export function projectRecallHooks(
  hooks: Hooks | null | undefined,
  contextEvents: readonly string[] | undefined,
): Hooks | null {
  if (!hooks || contextEvents === undefined) return hooks ?? null;
  const result: Hooks = {};
  for (const [event, entries] of Object.entries(hooks)) {
    if (!Array.isArray(entries)) continue;
    const kept = contextEvents.includes(event)
      ? entries
      : entries.filter((entry) => !isRecallEntry(entry));
    if (kept.length > 0) result[event] = kept;
  }
  return result;
}
