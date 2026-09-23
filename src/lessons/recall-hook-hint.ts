import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  isManagedRecallCommand,
  RECALL_HOOK_COMMAND,
  recallHookCommand,
} from './recall-hook-scaffold.js';

export const RECALL_HOOK_TEAM_HINT =
  'Lessons recall hooks call a global agentsmesh: teammates without a global install will ' +
  "not get lesson recall; add agentsmesh as a devDependency and re-run 'agentsmesh init --lessons'.";

/**
 * One-line hint for `init` and `generate`, or null. When the recall hook in
 * hooks.yaml runs another launcher than this project now uses (agentsmesh was
 * added to or removed from the devDependencies; `generate` already switched the
 * merge driver), it asks to re-run init. Otherwise it warns when the hook calls
 * a global agentsmesh in a Node project, which fails silently for teammates
 * without one. Projects without a package.json get no dependency hint.
 */
export function recallHookTeamHint(projectRoot: string): string | null {
  const wired = wiredRecallCommands(projectRoot);
  if (wired.length === 0) return null;
  const expected = recallHookCommand(projectRoot);
  const stale = wired.find((command) => command !== expected);
  if (stale !== undefined) {
    return (
      `Lessons recall hooks run \`${stale}\`, but this project now calls \`${expected}\`; ` +
      "re-run 'agentsmesh init --lessons' to update them."
    );
  }
  if (!existsSync(join(projectRoot, 'package.json'))) return null;
  return expected === RECALL_HOOK_COMMAND ? RECALL_HOOK_TEAM_HINT : null;
}

/** The scaffold-written recall hook commands in hooks.yaml. */
function wiredRecallCommands(projectRoot: string): string[] {
  try {
    const hooks: unknown = parseYaml(
      readFileSync(join(projectRoot, '.agentsmesh', 'hooks.yaml'), 'utf8'),
    );
    return Object.values(hooks ?? {})
      .filter(Array.isArray)
      .flat()
      .map((entry: unknown) => (entry as { command?: unknown } | null)?.command)
      .filter(isManagedRecallCommand)
      .map((command) => command.trim());
  } catch {
    return [];
  }
}
