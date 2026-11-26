import { refreshCommandFastpath, type currentGraphStamp } from './cmd-fastpath.js';
import type { LessonsGraph } from './graph-schema.js';
import { matchLessons } from './lexical-retrieval.js';
import { normalizeRecallFile } from './normalize-query-file.js';
import { loadEffectiveness } from './outcome-log.js';
import type { LessonsQuery } from './query.js';
import { rankLessons } from './ranking.js';
import { loadRecallConfig } from './recall-config.js';
import { recordRecallTelemetry } from './recall-telemetry.js';
import type { RecallCoreOptions, RecallResult } from './recall-types.js';
import { commitSeen, filterUnseen, openSessionDedup } from './seen-cache.js';

/**
 * Recall over a graph the caller already loaded: freshen the command fast-path,
 * match, dedup, rank (with outcome-log effectiveness), trim, commit what was
 * delivered, record telemetry once. Shared by `recallLessons` (MCP, hook) and the
 * CLI `lessons query`, so the three entry points rank the same query the same way.
 *
 * `preReadStamp` is {@link currentGraphStamp} taken BEFORE the graph was read.
 */
export function recallFromGraph(
  projectRoot: string,
  graph: LessonsGraph,
  query: LessonsQuery,
  options: RecallCoreOptions,
  preReadStamp: ReturnType<typeof currentGraphStamp>,
): RecallResult {
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
  const bypass = options.all === true;
  const cfg = loadRecallConfig(projectRoot);
  const ranked = rankLessons(graph, matchQuery, forRank, {
    limit: bypass ? undefined : (options.limit ?? cfg.limit),
    maxTokens:
      bypass || options.maxTokens === null ? undefined : (options.maxTokens ?? cfg.maxTokens),
    // Down-rank proven fire-but-fail lessons (empty ⇒ neutral, so recall is
    // unchanged until the outcome log has real signal). Read from the side-channel
    // only when something survived matching+dedup — a no-match recall must not pay
    // the (up to 2MB) outcome-log read for a ranking of nothing.
    effectiveness:
      forRank.length === 0
        ? new Map()
        : loadEffectiveness(projectRoot, graph, new Set(forRank.map((m) => m.id))),
  });
  const lessons = options.trim === undefined ? ranked : options.trim(ranked);
  if (dedup !== null)
    commitSeen(
      dedup,
      lessons.map((l) => l.id),
    );
  // Only `all` is a bypass: every other recall is a mandatory, capped call.
  recordRecallTelemetry(projectRoot, graph, matchQuery, matches, lessons, {
    bypassed: bypass,
    session: dedup?.sessionId ?? options.sessionId,
    lexical: lexicalCount,
  });
  return { lessons, totalMatches: matches.length, suppressed: matches.length - forRank.length };
}
