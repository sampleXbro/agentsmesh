import { join } from 'node:path';
import { getVersion } from '../cli/version.js';
import { readLock } from '../config/core/lock.js';
import { agentsmeshInvocation } from './cli-invocation.js';
import { graphHasConflictMarkers } from './graph-problem.js';
import { LESSONS_GRAPH_PATH, loadLessonsGraphResilient } from './graph-store.js';
import { commitSeen, openSessionDedup } from './seen-cache.js';
import { autoSessionId } from './session-window.js';

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
const VERSION = /^v?(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** True when version `a` is older than `b`; false when either is not `x.y.z`. Two prereleases are never ordered. */
export function isOlderVersion(a: string, b: string): boolean {
  const x = VERSION.exec(a.trim());
  const y = VERSION.exec(b.trim());
  if (x === null || y === null) return false;
  for (let i = 1; i <= 3; i += 1) {
    const diff = Number(x[i]) - Number(y[i]);
    if (diff !== 0) return diff < 0;
  }
  return x[4] !== undefined && y[4] === undefined;
}

/** Graph health read straight from disk, for events that run no keyword recall. */
export function graphHealth(root: string): GraphHealth {
  const load = loadLessonsGraphResilient(root);
  if (load.status === 'corrupt') return { corrupt: true };
  if (load.status === 'newer-version') return { newerVersion: load.version };
  return {};
}

function graphNotice(root: string, health: GraphHealth): string | null {
  if (health.newerVersion !== undefined) {
    return (
      `agentsmesh lessons: ${LESSONS_GRAPH_PATH} is schema version ${health.newerVersion}, newer than ` +
      'this agentsmesh can read, so lesson recall is off. Upgrade agentsmesh.'
    );
  }
  if (health.corrupt !== true) return null;
  const validate = `\`${agentsmeshInvocation(root)} lessons validate\``;
  return graphHasConflictMarkers(root)
    ? `agentsmesh lessons: ${LESSONS_GRAPH_PATH} has an unresolved merge conflict, so lesson recall is off. Resolve it, then run ${validate}.`
    : `agentsmesh lessons: ${LESSONS_GRAPH_PATH} is unreadable (corrupt), so lesson recall is off. Run ${validate}.`;
}

async function versionNotice(root: string): Promise<string | null> {
  // An unreadable lock (e.g. a directory) just skips the notice.
  const lock = await readLock(join(root, '.agentsmesh')).catch(() => null);
  const cliVersion = getVersion();
  if (lock === null || !isOlderVersion(cliVersion, lock.libVersion)) return null;
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
    const version = await versionNotice(root);
    if (version !== null) notices.push(version);
    shown.push(VERSION_SENTINEL);
  }
  if (dedup !== null && shown.length > 0) commitSeen(dedup, shown);
  return notices;
}
