import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getVersion } from '../cli/version.js';
import { readLock } from '../config/core/lock.js';
import { agentsmeshInvocation } from './cli-invocation.js';
import { graphFilePath } from './graph-store.js';
import { commitSeen, openSessionDedup } from './seen-cache.js';
import { autoSessionId } from './session-window.js';
import { compareSemver } from './semver-compare.js';

/**
 * One-time visible warnings for the recall hook. Without them an unreadable
 * graph or a stale CLI makes recall silently empty or partial. Each notice
 * fires once per agent context (a seen-cache sentinel), so it does not repeat
 * on every tool call but does come back after a compaction reset.
 */

/** What recall reported about the graph it tried to read. */
export interface GraphHealth {
  readonly corrupt?: boolean;
  readonly newerVersion?: number;
}

const GRAPH_SENTINEL = '__notice-graph-unreadable__';
const VERSION_SENTINEL = '__notice-version-checked__';
const GRAPH_REL = '.agentsmesh/lessons/lessons.json';
const CONFLICT_MARKER = /^(?:<{7}|={7}|>{7})(?:\s|$)/m;

function hasConflictMarkers(root: string): boolean {
  try {
    return CONFLICT_MARKER.test(readFileSync(graphFilePath(root), 'utf8'));
  } catch {
    return false;
  }
}

function graphNotice(root: string, health: GraphHealth): string | null {
  if (health.newerVersion !== undefined) {
    return (
      `agentsmesh lessons: ${GRAPH_REL} is schema version ${health.newerVersion}, newer than ` +
      'this agentsmesh can read, so lesson recall is off. Upgrade agentsmesh.'
    );
  }
  if (health.corrupt !== true) return null;
  const validate = `\`${agentsmeshInvocation(root)} lessons validate\``;
  return hasConflictMarkers(root)
    ? `agentsmesh lessons: ${GRAPH_REL} has an unresolved merge conflict, so lesson recall is off. Resolve it, then run ${validate}.`
    : `agentsmesh lessons: ${GRAPH_REL} is unreadable (corrupt), so lesson recall is off. Run ${validate}.`;
}

async function versionNotice(root: string, cliVersion: string): Promise<string | null> {
  const lock = await readLock(join(root, '.agentsmesh'));
  if (lock === null || compareSemver(cliVersion, lock.libVersion) !== -1) return null;
  return (
    `agentsmesh lessons: the installed agentsmesh (${cliVersion}) is older than the one this ` +
    `project was generated with (${lock.libVersion}), so lesson recall may be incomplete. ` +
    'Upgrade agentsmesh.'
  );
}

/**
 * Notices not yet shown to this context. A payload without a session id falls
 * back to a per-day key, so a harness that sends none is warned once a day.
 */
export async function sessionNotices(
  root: string,
  sessionId: string | undefined,
  health: GraphHealth,
  cliVersion: string = getVersion(),
): Promise<string[]> {
  const dedup = openSessionDedup({
    explicit: sessionId ?? `hook-notices-${autoSessionId()}`,
    projectRoot: root,
  });
  const seen = dedup?.seen ?? new Set<string>();
  const notices: string[] = [];
  const shown: string[] = [];
  const graph = seen.has(GRAPH_SENTINEL) ? null : graphNotice(root, health);
  if (graph !== null) {
    notices.push(graph);
    shown.push(GRAPH_SENTINEL);
  }
  if (!seen.has(VERSION_SENTINEL)) {
    const version = await versionNotice(root, cliVersion);
    if (version !== null) notices.push(version);
    shown.push(VERSION_SENTINEL);
  }
  if (dedup !== null && shown.length > 0) commitSeen(dedup, shown);
  return notices;
}
