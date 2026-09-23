import type { CanonicalFiles } from '../../core/types.js';
import { projectRecallHooks } from '../projection/recall-hooks.js';
import { getBuiltinTargetDefinition } from './builtin-targets.js';
import { getDescriptor } from './registry.js';

/**
 * `canonical` with the lessons recall hook kept only on `target`'s
 * `hookContextEvents` — builtin or registered plugin alike. Returns `canonical`
 * itself when the target declares nothing.
 */
export function withTargetRecallHooks(canonical: CanonicalFiles, target: string): CanonicalFiles {
  const descriptor = getBuiltinTargetDefinition(target) ?? getDescriptor(target);
  const contextEvents = descriptor?.hookContextEvents;
  if (contextEvents === undefined || canonical.hooks === null) return canonical;
  return { ...canonical, hooks: projectRecallHooks(canonical.hooks, contextEvents) };
}
