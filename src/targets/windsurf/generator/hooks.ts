import type { CanonicalFiles, Hooks } from '../../../core/types.js';
import { getHookCommand, getHookPrompt, hasHookText } from '../../../core/hook-command.js';
import { WINDSURF_HOOKS_FILE } from '../constants.js';
import { WINDSURF_HOOK_CONTEXT_EVENTS, windsurfEventName } from '../hook-events.js';
import { projectRecallHooks } from '../../projection/recall-hooks.js';
import type { RulesOutput } from './types.js';

/** Windsurf hook entries carry no matcher: every hook runs on each event occurrence. */
function toWindsurfHooks(hooks: Hooks): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [event, entries] of Object.entries(hooks)) {
    if (!Array.isArray(entries)) continue;
    const translated: Array<Record<string, unknown>> = [];
    for (const entry of entries) {
      if (!hasHookText(entry)) continue;
      const command = getHookCommand(entry);
      const prompt = getHookPrompt(entry);
      const value = entry.type === 'prompt' ? prompt || command : command || prompt;
      if (!value) continue;
      translated.push({ command: value, show_output: true });
    }
    if (translated.length > 0) result[windsurfEventName(event)] = translated;
  }
  return result;
}

export function generateHooks(canonical: CanonicalFiles): RulesOutput[] {
  const projected = projectRecallHooks(canonical.hooks, WINDSURF_HOOK_CONTEXT_EVENTS);
  if (!projected || Object.keys(projected).length === 0) return [];
  const hooks = toWindsurfHooks(projected);
  if (Object.keys(hooks).length === 0) return [];
  return [{ path: WINDSURF_HOOKS_FILE, content: JSON.stringify({ hooks }, null, 2) }];
}
