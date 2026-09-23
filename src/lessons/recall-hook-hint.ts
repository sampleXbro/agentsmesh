import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  isRecallHookCommand,
  RECALL_HOOK_COMMAND,
  recallHookCommand,
} from './recall-hook-scaffold.js';

export const RECALL_HOOK_TEAM_HINT =
  'Lessons recall hooks call a global agentsmesh: teammates without a global install will ' +
  "not get lesson recall; add agentsmesh as a devDependency and re-run 'agentsmesh init --lessons'.";

/**
 * One-line hint for `init` and `generate`, or null. Shown when hooks.yaml wires
 * the recall hook but the Node project does not depend on agentsmesh: the hook
 * then runs whatever global install each teammate has, and fails silently for
 * those without one. Projects without a package.json get no hint, because a
 * devDependency is not their fix.
 */
export function recallHookTeamHint(projectRoot: string): string | null {
  if (!existsSync(join(projectRoot, 'package.json'))) return null;
  if (recallHookCommand(projectRoot) !== RECALL_HOOK_COMMAND) return null;
  return wiresRecallHook(projectRoot) ? RECALL_HOOK_TEAM_HINT : null;
}

function wiresRecallHook(projectRoot: string): boolean {
  let hooks: unknown;
  try {
    hooks = parseYaml(readFileSync(join(projectRoot, '.agentsmesh', 'hooks.yaml'), 'utf8'));
  } catch {
    return false;
  }
  if (typeof hooks !== 'object' || hooks === null) return false;
  return Object.values(hooks).some(
    (entries) =>
      Array.isArray(entries) &&
      entries.some(
        (entry: unknown) =>
          typeof entry === 'object' &&
          entry !== null &&
          typeof (entry as { command?: unknown }).command === 'string' &&
          isRecallHookCommand((entry as { command: string }).command),
      ),
  );
}
