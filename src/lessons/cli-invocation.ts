import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LOCAL_FIRST = 'npx --no --offline agentsmesh';
const BARE = 'agentsmesh';
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies'] as const;

/**
 * The command a generated hook or git merge driver uses to launch the CLI.
 *
 * `npx --no --offline` prefers the project's own copy, falls back to a global
 * install and never downloads. That fixes a teammate who has agentsmesh only
 * as a project dependency, and a stale global install beating the pinned
 * version. It also roughly doubles the per-call cost for a global-only user,
 * and the recall hook runs before every edit and command, so it is used only
 * when the project depends on agentsmesh, which is when it pays off.
 */
export function agentsmeshInvocation(projectRoot: string): string {
  return dependsOnAgentsmesh(projectRoot) ? LOCAL_FIRST : BARE;
}

function dependsOnAgentsmesh(projectRoot: string): boolean {
  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
  } catch {
    return false;
  }
  if (typeof manifest !== 'object' || manifest === null) return false;
  const record = manifest as Record<string, unknown>;
  return DEPENDENCY_FIELDS.some((field) => {
    const deps = record[field];
    return typeof deps === 'object' && deps !== null && 'agentsmesh' in deps;
  });
}
