import { maybeAutoMigrateLessons } from './auto-migrate.js';
import { currentGraphStamp, refreshCommandFastpath } from './cmd-fastpath.js';
import { loadLessonsGraphResilient } from './graph-store.js';
import { normalizeRecallFile } from './normalize-query-file.js';
import { matchLessons } from './lexical-retrieval.js';
import type { LessonsQuery } from './query.js';
import { rankLessons, type RankedLesson } from './ranking.js';
import { loadRecallConfig } from './recall-config.js';
import { recordRecallTelemetry } from './recall-telemetry.js';
import { loadEffectiveness } from './outcome-log.js';
import { commitSeen, filterUnseen, openSessionDedup } from './seen-cache.js';

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

export interface RecallOptions {
  /** Max ranked lessons to return. Defaults to {@link DEFAULT_RECALL_LIMIT}. */
  readonly limit?: number;
  /**
   * Cumulative rule-token budget. Defaults to {@link DEFAULT_RECALL_MAX_TOKENS};
   * pass `null` to disable the budget (return up to `limit` results).
   */
  readonly maxTokens?: number | null;
  /**
   * Session correlator for recall dedup. Defaults to `AGENTSMESH_SESSION_ID`;
   * when set, lessons already delivered this session are suppressed.
   */
  readonly sessionId?: string;
  /** Force dedup off even when a session correlator is present. */
  readonly noDedup?: boolean;
  /**
   * Expire suppressions this long after delivery. Set by callers that have NO
   * context-reset signal (the MCP server never sees the client compact), so a
   * lesson dropped from a summarized context cannot stay hidden forever. The
   * hook path leaves this unset on purpose: it resets on SessionStart
   * compact/clear, which is the exact signal a wall-clock TTL only approximates.
   */
  readonly ttlMs?: number;
  /**
   * Migrate a legacy store first (default true). The hook passes false: the
   * migration deletes files, so it only runs from a command the user runs.
   */
  readonly autoMigrate?: boolean;
}

export interface RecallResult {
  /** Relevance-ranked, capped lessons (compact metadata lives on each entry). */
  readonly lessons: RankedLesson[];
  /** How many active lessons matched the query before the caps were applied. */
  readonly totalMatches: number;
  /**
   * True when the canonical graph existed but could not be read (corrupt JSON /
   * schema drift). Recall degrades to empty instead of throwing; callers surface
   * this so a corrupt graph is a visible warning, not silent zero recall.
   */
  readonly corrupt?: boolean;
  /**
   * Set to the on-disk schema version when the graph is newer than this build
   * understands. Recall degrades to empty (like `corrupt`) but callers surface
   * an upgrade hint rather than a "corrupt" warning.
   */
  readonly newerVersion?: number;
  /**
   * Count of matched lessons suppressed because they were already delivered
   * earlier in this session (dedup). 0 when dedup is off or nothing repeated.
   */
  readonly suppressed: number;
}

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
  try {
    if (options.autoMigrate !== false) await maybeAutoMigrateLessons(projectRoot);
  } catch {
    // Degrade; see above.
  }
  // Stamp BEFORE the read: refreshCommandFastpath only writes when the file
  // still carries this stamp, so a graph write landing inside the read window
  // can never be cached under stale patterns (see cmd-fastpath.ts).
  const preReadStamp = currentGraphStamp(projectRoot);
  const load = loadLessonsGraphResilient(projectRoot);
  if (load.status === 'corrupt') {
    return { lessons: [], totalMatches: 0, suppressed: 0, corrupt: true };
  }
  if (load.status === 'newer-version') {
    return { lessons: [], totalMatches: 0, suppressed: 0, newerVersion: load.version };
  }
  if (load.status === 'absent') return { lessons: [], totalMatches: 0, suppressed: 0 };
  const graph = load.graph;
  // Freshen the command fast-path cache while the graph is in hand (no-op when fresh).
  refreshCommandFastpath(projectRoot, graph, preReadStamp);
  // Normalize the file path so a project-relative glob matches regardless of the
  // shape the caller passed (absolute / ./-prefixed / backslash).
  const matchQuery: LessonsQuery =
    query.file === undefined
      ? query
      : { ...query, file: normalizeRecallFile(query.file, projectRoot) };
  // Task text (prompt submit, task-start keyword recall) also reaches lessons by
  // their wording; a file/command query never does — see lexical-retrieval.ts.
  const { matches, lexicalCount } = matchLessons(graph, matchQuery);
  // Dedup BEFORE ranking so the caps fill with fresh lessons (see seen-cache).
  const dedup = openSessionDedup({
    explicit: options.sessionId,
    disabled: options.noDedup,
    projectRoot,
    ...(options.ttlMs !== undefined ? { ttlMs: options.ttlMs } : {}),
  });
  const forRank = dedup === null ? matches : filterUnseen(dedup, matches);
  // Per-project recall tuning is the fallback for unset options; explicit
  // options (and `maxTokens: null` to disable the budget) still win.
  const cfg = loadRecallConfig(projectRoot);
  const lessons = rankLessons(graph, matchQuery, forRank, {
    limit: options.limit ?? cfg.limit,
    maxTokens: options.maxTokens === null ? undefined : (options.maxTokens ?? cfg.maxTokens),
    // Down-rank proven fire-but-fail lessons (empty ⇒ neutral, so recall is
    // unchanged until the outcome log has real signal). Read from the side-channel
    // only when something survived matching+dedup — a no-match recall must not pay
    // the (up to 2MB) outcome-log read for a ranking of nothing.
    effectiveness:
      forRank.length === 0
        ? new Map()
        : loadEffectiveness(projectRoot, graph, new Set(forRank.map((m) => m.id))),
  });
  if (dedup !== null)
    commitSeen(
      dedup,
      lessons.map((l) => l.id),
    );
  // The application/MCP path has no `--all`; recall here is always a mandatory,
  // capped call, so it is never a bypass.
  recordRecallTelemetry(projectRoot, graph, matchQuery, matches, lessons, {
    bypassed: false,
    session: options.sessionId,
    lexical: lexicalCount,
  });
  return { lessons, totalMatches: matches.length, suppressed: matches.length - forRank.length };
}
