import type { CanonicalFiles } from '../../../core/types.js';
import { CURSOR_HOOKS } from '../constants.js';
import { CURSOR_HOOK_CONTEXT_EVENTS, toCursorHooks } from '../hook-format.js';
import { projectRecallHooks } from '../../projection/recall-hooks.js';
import type { RulesOutput } from './types.js';

export function generateHooks(canonical: CanonicalFiles): RulesOutput[] {
  const hooks = projectRecallHooks(canonical.hooks, CURSOR_HOOK_CONTEXT_EVENTS);
  if (!hooks || Object.keys(hooks).length === 0) return [];
  const cursorHooks = toCursorHooks(hooks);
  if (Object.keys(cursorHooks).length === 0) return [];
  const content = JSON.stringify({ version: 1, hooks: cursorHooks }, null, 2);
  return [{ path: CURSOR_HOOKS, content }];
}
