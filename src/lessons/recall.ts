import { maybeAutoMigrateLessons } from './auto-migrate.js';
import { currentGraphStamp } from './cmd-fastpath.js';
import { loadLessonsGraphResilient } from './graph-store.js';
import type { LessonsQuery } from './query.js';
import { recallFromGraph } from './recall-core.js';
import type { RecallOptions, RecallResult } from './recall-types.js';

export type { RecallOptions, RecallResult } from './recall-types.js';

/**
 * Migration-aware application APIs for the lessons subsystem.
 *
 * The WRITE path migrates automatically: `mutateLessonsGraph` (and everything
 * built on it — `addLesson`, `mergeLessons`, deprecate, strip-markers) runs the
 * legacy→JSON migration before mutating, so even a first raw write can never
 * create an empty `lessons.json` over an unmigrated `index.yaml`. (The migrator
 * and scaffolding use the internal `mutateLessonsGraphLocked` to avoid
 * recursing.)
 *
 * The low-level READ primitives (`tryLoadLessonsGraph`, `loadLessonsGraph`,
 * `queryLessons`) do NOT migrate — a first read through them on a legacy project
 * would see no graph. `recallLessons` closes that: it migrates first, then
 * loads + ranks. `captureLesson` (capture.ts) is the symmetric capture entry
 * point. Prefer these application APIs; reach for the read primitives only
 * post-migration.
 */

/**
 * Recall primitive for applications: migrate if needed, then return the active
 * lessons matching `query`, relevance-ranked and capped by limit + token budget.
 */
export async function recallLessons(
  projectRoot: string,
  query: LessonsQuery,
  options: RecallOptions = {},
): Promise<RecallResult> {
  // Recall is a blocking dependency and must never crash: a corrupt LEGACY
  // store (malformed index.yaml) fails migration here, so degrade to whatever
  // graph state exists (usually absent → empty recall) and leave the legacy
  // files intact for an explicit `lessons import-md` to surface the error.
  // WRITE paths keep failing loudly so a fresh graph never strands the legacy.
  // The reason is handed back so the caller can say why recall came up empty.
  let migrationError: string | undefined;
  try {
    if (options.autoMigrate !== false) await maybeAutoMigrateLessons(projectRoot);
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err);
  }
  const withMigration = (r: RecallResult): RecallResult =>
    migrationError === undefined ? r : { ...r, migrationError };
  // Stamp BEFORE the read: refreshCommandFastpath only writes when the file
  // still carries this stamp, so a graph write landing inside the read window
  // can never be cached under stale patterns (see cmd-fastpath.ts).
  const preReadStamp = currentGraphStamp(projectRoot);
  const load = loadLessonsGraphResilient(projectRoot);
  const none: RecallResult = { lessons: [], totalMatches: 0, suppressed: 0 };
  if (load.status === 'corrupt') return withMigration({ ...none, corrupt: true });
  if (load.status === 'newer-version') {
    return withMigration({ ...none, newerVersion: load.version });
  }
  if (load.status === 'absent') return withMigration(none);
  return withMigration(recallFromGraph(projectRoot, load.graph, query, options, preReadStamp));
}
