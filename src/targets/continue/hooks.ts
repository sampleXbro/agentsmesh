/**
 * Continue hooks: the `hooks` key of `.continue/settings.json` (project) and
 * `~/.continue/settings.json` (global) — same relative path at both scopes.
 *
 * Continue's loader (extensions/cli/src/hooks/hookConfig.ts + types.ts) states
 * the schemas "match the exact schemas from Claude Code", so the Claude Code
 * serializer is reused verbatim rather than duplicated.
 *
 * Two upstream behaviours shape this module:
 *  - hooks from every source are APPENDED, never replaced, so agentsmesh must
 *    own only the `hooks` key and leave the rest of the file alone;
 *  - `.continue/settings.local.json` is the user's gitignored override with the
 *    highest precedence, so it is never generated. Continue also reads
 *    `~/.claude/settings.json` and `.claude/settings.json` for
 *    cross-compatibility; those belong to the claude-code target and are not
 *    written here.
 */

import { AB_HOOKS } from '../../core/canonical-paths.js';
import { dirname, join } from 'node:path';
import { stringify as yamlStringify } from 'yaml';
import type { CanonicalFiles, ImportResult } from '../../core/types.js';
import type { GeneratedOutputMerger } from '../catalog/target-descriptor.js';
import { buildClaudeHooksObjectFromCanonical } from '../claude-code/hooks-format.js';
import { claudeHooksToCanonical } from '../claude-code/settings-helpers.js';
import { mkdirp, readFileSafe, writeFileAtomic } from '../../utils/filesystem/fs.js';
import { CONTINUE_SETTINGS, CONTINUE_TARGET } from './constants.js';
import type { ContinueOutput } from './generator.js';

/** Hook events Continue dispatches (extensions/cli/src/hooks/types.ts). */
export const CONTINUE_HOOK_EVENTS: readonly string[] = [
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'UserPromptSubmit',
  'SessionStart',
  'SessionEnd',
  'Stop',
  'Notification',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
  'ConfigChange',
  'TeammateIdle',
  'TaskCompleted',
  'WorktreeCreate',
  'WorktreeRemove',
];

export function generateHooks(canonical: CanonicalFiles): ContinueOutput[] {
  const hooks = buildClaudeHooksObjectFromCanonical(canonical);
  if (Object.keys(hooks).length === 0) return [];
  return [{ path: CONTINUE_SETTINGS, content: JSON.stringify({ hooks }, null, 2) }];
}

/** Returns null when `raw` holds content that is not a JSON object. */
function parseJsonObjectOrNull(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  return parseJsonObjectOrNull(raw) ?? {};
}

/**
 * Key-scoped merge: agentsmesh owns `hooks` (canonical hooks.yaml is the source
 * of truth, so removals must propagate) and never rewrites the rest of the
 * user's settings file. The base is the pending in-memory result when one
 * exists, so a second writer in the same pass cannot clobber the first.
 *
 * A settings file that is not a JSON object is returned untouched: rewriting it
 * as `{ "hooks": … }` would silently drop description, disableAllHooks and every
 * other key the user typed. Hooks then do not land until the file is valid.
 */
export const mergeContinueSettings: GeneratedOutputMerger = (
  existing,
  pending,
  newContent,
  resolvedPath,
) => {
  if (resolvedPath !== CONTINUE_SETTINGS) return null;
  const raw = pending?.content ?? existing;
  const base = raw?.trim() ? parseJsonObjectOrNull(raw) : {};
  if (base === null) return raw;
  let incoming: Record<string, unknown>;
  try {
    incoming = JSON.parse(newContent) as Record<string, unknown>;
  } catch {
    return pending?.content ?? existing ?? newContent;
  }
  if (incoming.hooks !== undefined) base.hooks = incoming.hooks;
  return JSON.stringify(base, null, 2);
};

/**
 * Import the `hooks` key of `.continue/settings.json` into canonical hooks.yaml.
 * The reverse Claude Code mapper is reused because the on-disk shape is identical.
 */
export async function importContinueHooks(
  projectRoot: string,
  results: ImportResult[],
): Promise<void> {
  const srcPath = join(projectRoot, CONTINUE_SETTINGS);
  const content = await readFileSafe(srcPath);
  if (content === null) return;
  const rawHooks = parseJsonObject(content).hooks;
  if (!rawHooks || typeof rawHooks !== 'object' || Array.isArray(rawHooks)) return;

  const hooks = claudeHooksToCanonical(rawHooks as Record<string, unknown>);
  if (Object.keys(hooks).length === 0) return;

  const destPath = join(projectRoot, AB_HOOKS);
  await mkdirp(dirname(destPath));
  await writeFileAtomic(destPath, yamlStringify(hooks));
  results.push({
    fromTool: CONTINUE_TARGET,
    fromPath: srcPath,
    toPath: AB_HOOKS,
    feature: 'hooks',
  });
}
