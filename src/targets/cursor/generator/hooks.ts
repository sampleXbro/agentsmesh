import type { CanonicalFiles } from '../../../core/types.js';
import { CURSOR_HOOKS } from '../constants.js';
import { toCursorHooks } from '../hook-format.js';
import type { RulesOutput } from './types.js';

export function generateHooks(canonical: CanonicalFiles): RulesOutput[] {
  if (!canonical.hooks) return [];
  const cursorHooks = toCursorHooks(canonical.hooks);
  if (Object.keys(cursorHooks).length === 0) return [];
  const content = JSON.stringify({ version: 1, hooks: cursorHooks }, null, 2);
  return [{ path: CURSOR_HOOKS, content }];
}
