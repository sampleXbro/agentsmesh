import type { LessonsGraph } from './graph-schema.js';
import { collectMatchedTriggersByKind, type LessonsQuery, type MatchedLesson } from './query.js';
import { estTokens, type RankedLesson } from './ranking.js';
import { appendRecallRecord, isTelemetryEnabled, sessionId } from './telemetry.js';
import { contextKey } from './context-key.js';

/**
 * Append one telemetry record for this recall — gated, so the hot path computes
 * nothing (no provenance pass, no timestamp, no I/O) in the default-off config.
 *
 * Exported so the CLI `lessons query` handler records identically to this
 * (MCP) path; both query entry points MUST share this single recorder, or
 * shell-driven recall would be invisible to `lessons stats`.
 */
export function recordRecallTelemetry(
  projectRoot: string,
  graph: LessonsGraph,
  query: LessonsQuery,
  matches: readonly MatchedLesson[],
  lessons: readonly RankedLesson[],
  options: {
    readonly bypassed?: boolean;
    readonly session?: string;
    /** Candidates that came from rule wording, not a trigger (lexical retrieval). */
    readonly lexical?: number;
  } = {},
): void {
  if (!isTelemetryEnabled(process.env, projectRoot)) return;
  const byKind = collectMatchedTriggersByKind(graph, query);
  const countVia = (set: Set<string>): number =>
    matches.filter(({ lesson }) => lesson.triggers.some((t) => set.has(t))).length;
  // Explicit caller session (hook stdin / --session) wins; env is the fallback.
  const session = options.session ?? sessionId();
  appendRecallRecord(projectRoot, {
    ts: new Date().toISOString(),
    hasFile: query.file !== undefined,
    hasCommand: query.command !== undefined,
    hasKeyword: query.keyword !== undefined,
    totalMatches: matches.length,
    returnedCount: lessons.length,
    returnedTokens: lessons.reduce((sum, l) => sum + estTokens(l.lesson.rule), 0),
    truncated: matches.length > lessons.length,
    contextKey: contextKey({ file: query.file, command: query.command }, projectRoot),
    matchedByKind: {
      file: countVia(byKind.file_glob),
      command: countVia(byKind.command_pattern),
      keyword: countVia(byKind.keyword),
      ...(options.lexical !== undefined ? { text: options.lexical } : {}),
    },
    lessonIds: lessons.map((l) => l.id),
    bypassed: options.bypassed === true,
    ...(session !== undefined ? { session } : {}),
  });
}
