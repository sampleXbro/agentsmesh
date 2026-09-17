import { AB_HOOKS } from '../../core/canonical-paths.js';
import { dirname, join } from 'node:path';
import { stringify as yamlStringify } from 'yaml';
import { parseHooks } from '../../canonical/features/hooks.js';
import type { HookEntry, Hooks, ImportResult } from '../../core/types.js';
import { readFileSafe, writeFileAtomic, mkdirp } from '../../utils/filesystem/fs.js';
import { WINDSURF_TARGET, WINDSURF_HOOKS_FILE } from './constants.js';
import { canonicalHookEventName } from './hook-events.js';

/** Canonical wildcard: Windsurf hooks have no matcher, so a fresh import scopes to every tool. */
const WILDCARD_MATCHER = '*';

export async function importWindsurfHooks(
  projectRoot: string,
  results: ImportResult[],
): Promise<void> {
  const hooksPath = join(projectRoot, WINDSURF_HOOKS_FILE);
  const hooksContent = await readFileSafe(hooksPath);
  if (!hooksContent) return;
  try {
    const parsed = JSON.parse(hooksContent) as Record<string, unknown>;
    if (!parsed.hooks || typeof parsed.hooks !== 'object' || Array.isArray(parsed.hooks)) return;
    const destPath = join(projectRoot, AB_HOOKS);
    const existing = (await parseHooks(destPath)) ?? {};
    const canonical = windsurfHooksToCanonical(parsed.hooks as Record<string, unknown>, existing);
    if (Object.keys(canonical).length === 0) return;
    await mkdirp(dirname(destPath));
    await writeFileAtomic(destPath, yamlStringify(canonical));
    results.push({
      fromTool: WINDSURF_TARGET,
      fromPath: hooksPath,
      toPath: AB_HOOKS,
      feature: 'hooks',
    });
  } catch {
    // Invalid hooks JSON should not fail import.
  }
}

/** Matcher of the canonical entry already on disk for this (event, command), else the wildcard. */
function preservedMatcher(existing: Hooks, event: string, command: string): string {
  const match = existing[event]?.find((entry) => entry.command === command);
  return match?.matcher ?? WILDCARD_MATCHER;
}

function legacyEntries(entry: Record<string, unknown>): HookEntry[] {
  const matcher =
    typeof entry.matcher === 'string' && entry.matcher.trim() ? entry.matcher : WILDCARD_MATCHER;
  const hooksList = Array.isArray(entry.hooks) ? entry.hooks : [];
  const out: HookEntry[] = [];
  for (const item of hooksList) {
    if (!item || typeof item !== 'object') continue;
    const hook = item as Record<string, unknown>;
    const command =
      typeof hook.command === 'string'
        ? hook.command
        : typeof hook.prompt === 'string'
          ? hook.prompt
          : '';
    if (!command.trim()) continue;
    const canonical: HookEntry = {
      matcher,
      type: hook.type === 'prompt' ? 'prompt' : 'command',
      command,
    };
    if (typeof hook.timeout === 'number') canonical.timeout = hook.timeout;
    out.push(canonical);
  }
  return out;
}

function windsurfHooksToCanonical(hooks: Record<string, unknown>, existing: Hooks): Hooks {
  const result: Hooks = {};
  for (const [event, entries] of Object.entries(hooks)) {
    if (!Array.isArray(entries)) continue;
    const mappedEvent = canonicalHookEventName(event);
    if (mappedEvent === null) continue;
    const canonicalEntries: HookEntry[] = [];
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      if (typeof e.command === 'string' && e.command.trim()) {
        canonicalEntries.push({
          matcher: preservedMatcher(existing, mappedEvent, e.command),
          type: 'command',
          command: e.command,
        });
        continue;
      }
      canonicalEntries.push(...legacyEntries(e));
    }
    if (canonicalEntries.length > 0) result[mappedEvent] = canonicalEntries;
  }
  return result;
}
