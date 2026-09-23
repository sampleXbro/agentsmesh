import type { CanonicalFiles, Hooks } from '../../core/types.js';
import { isRecallHookCommand } from '../../lessons/recall-hook-scaffold.js';
import { getBuiltinTargetDefinition } from './builtin-targets.js';
import { getDescriptor } from './registry.js';

/**
 * `canonical` with the lessons recall hook kept only on `target`'s
 * `hookContextEvents` — builtin or registered plugin alike. User hooks pass
 * through; an event left empty is dropped. Returns `canonical` itself when the
 * target declares nothing. The engine applies this on every hooks emission path.
 */
export function withTargetRecallHooks(canonical: CanonicalFiles, target: string): CanonicalFiles {
  const descriptor = getBuiltinTargetDefinition(target) ?? getDescriptor(target);
  const contextEvents = descriptor?.hookContextEvents;
  if (contextEvents === undefined || canonical.hooks === null) return canonical;
  const hooks: Hooks = {};
  for (const [event, entries] of Object.entries(canonical.hooks)) {
    if (!Array.isArray(entries)) continue;
    const kept = contextEvents.includes(event)
      ? entries
      : entries.filter((entry) => !isRecallHookCommand(entry?.command));
    if (kept.length > 0) hooks[event] = kept;
  }
  return { ...canonical, hooks };
}
