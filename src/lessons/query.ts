import { getGlobMatcher } from './glob-safety.js';
import type { Lesson, LessonsGraph, Trigger } from './graph-schema.js';
import { keywordMatches } from './keyword-match.js';
import { getCommandMatcher } from './regex-safety.js';
import type { WorkBudget } from './regex-linear/index.js';

/**
 * Query-wide budget for command_pattern matching (NFA state-visits). ONE budget
 * is shared across every trigger in a single recall, so total matching work is
 * bounded regardless of how many near-cap patterns the graph holds — not just
 * per pattern. ~5M state-visits ≈ a few hundred ms worst case; a normal query
 * uses a tiny fraction. When exhausted, remaining command patterns are treated
 * as non-matches (safe degradation, never a false positive).
 */
const COMMAND_MATCH_BUDGET = 5_000_000;

/**
 * Query-wide budget for file_glob matching (DP cells, see glob-safety.ts). Each
 * glob is also capped per match; this bounds a graph full of costly globs to a
 * few tens of ms. A normal query uses well under 1%.
 */
const GLOB_MATCH_BUDGET = 2_000_000;

interface MatchBudgets {
  readonly command: WorkBudget;
  readonly glob: WorkBudget;
}

export interface LessonsQuery {
  /** Project-relative path of the file about to be edited. */
  readonly file?: string;
  /** Shell command about to be executed. */
  readonly command?: string;
  /** Free-form text describing the current task. */
  readonly keyword?: string;
}

export interface MatchedLesson {
  readonly id: string;
  readonly lesson: Lesson;
  /** Set when the lesson was reached by its wording, not a trigger (lexical retrieval). */
  readonly lexical?: true;
}

/**
 * Recall primitive — returns every active lesson whose triggers match any of
 * the supplied query fields. The query fields combine as OR across triggers:
 * a lesson matches if ANY of its triggers match ANY supplied field.
 * Deprecated and superseded lessons are excluded.
 */
export function queryLessons(graph: LessonsGraph, query: LessonsQuery): MatchedLesson[] {
  if (query.file === undefined && query.command === undefined && query.keyword === undefined) {
    return [];
  }

  const matchedTriggerIds = collectMatchedTriggerIds(graph, query);

  const matched: MatchedLesson[] = [];
  for (const [id, lesson] of Object.entries(graph.lessons)) {
    if (lesson.status !== 'active') continue;
    // Always-on lessons are delivered on every task (see collectAlwaysLessons),
    // not via triggers — exclude them here so triggered recall never double-injects.
    if (lesson.scope === 'always') continue;
    if (lesson.triggers.some((t) => matchedTriggerIds.has(t))) {
      matched.push({ id, lesson });
    }
  }

  matched.sort((a, b) => (a.id < b.id ? -1 : 1));
  return matched;
}

/**
 * Active always-on lessons (`scope: 'always'`) — universal standards delivered on
 * every task rather than matched by triggers. Sorted newest-first (then id) so a
 * token cap keeps the most recent; the caller bounds the set.
 */
export function collectAlwaysLessons(graph: LessonsGraph): MatchedLesson[] {
  const out: MatchedLesson[] = [];
  for (const [id, lesson] of Object.entries(graph.lessons)) {
    if (lesson.status === 'active' && lesson.scope === 'always') out.push({ id, lesson });
  }
  out.sort((a, b) =>
    a.lesson.createdAt !== b.lesson.createdAt
      ? a.lesson.createdAt < b.lesson.createdAt
        ? 1
        : -1
      : a.id < b.id
        ? -1
        : 1,
  );
  return out;
}

/** Matched trigger ids split by kind — drives recall telemetry provenance. */
export interface MatchedTriggersByKind {
  readonly file_glob: Set<string>;
  readonly command_pattern: Set<string>;
  readonly keyword: Set<string>;
}

/**
 * Partition the query's matched trigger ids by kind in a single pass. The flat
 * {@link collectMatchedTriggerIds} delegates here so matching logic and the
 * shared command-pattern budget live in exactly one place.
 */
export function collectMatchedTriggersByKind(
  graph: LessonsGraph,
  query: LessonsQuery,
): MatchedTriggersByKind {
  const byKind: MatchedTriggersByKind = {
    file_glob: new Set(),
    command_pattern: new Set(),
    keyword: new Set(),
  };
  // One budget per kind, shared across ALL triggers of that kind in this query.
  const budgets: MatchBudgets = {
    command: { remaining: COMMAND_MATCH_BUDGET },
    glob: { remaining: GLOB_MATCH_BUDGET },
  };
  for (const [id, trigger] of Object.entries(graph.triggers)) {
    if (triggerMatches(trigger, query, budgets)) byKind[trigger.kind].add(id);
  }
  return byKind;
}

/** The set of trigger ids that match the query — shared by recall and ranking. */
export function collectMatchedTriggerIds(graph: LessonsGraph, query: LessonsQuery): Set<string> {
  const { file_glob, command_pattern, keyword } = collectMatchedTriggersByKind(graph, query);
  return new Set([...file_glob, ...command_pattern, ...keyword]);
}

function triggerMatches(trigger: Trigger, query: LessonsQuery, budgets: MatchBudgets): boolean {
  switch (trigger.kind) {
    case 'file_glob': {
      if (query.file === undefined) return false;
      // Linear-time matcher; null = outside the safe glob subset, so a hostile
      // or unsupported glob is a non-match (fail closed, see glob-safety.ts).
      const matcher = getGlobMatcher(trigger.pattern);
      return matcher !== null && matcher.test(query.file, budgets.glob);
    }
    case 'command_pattern': {
      if (query.command === undefined) return false;
      // Match via the non-backtracking linear engine — recall must never run a
      // backtracking regex on the hot path (see regex-safety.ts). null = the
      // pattern is unsupported/over-long; treat as a non-match (fail closed).
      // The shared budget bounds total command-matching work query-wide.
      const matcher = getCommandMatcher(trigger.pattern);
      return matcher !== null && matcher.test(query.command, budgets.command);
    }
    case 'keyword':
      // Matches the explicit --keyword (substring) OR the file/command tokens, so
      // keyword-only conceptual lessons surface on mandatory --file/--cmd recall.
      return keywordMatches(trigger.pattern, query);
  }
}

/**
 * Fast-path parity probe: could a command-only query match ANY of these
 * patterns? MUST mirror {@link queryLessons}'s trigger matching exactly (same
 * linear engine, same budget seed, same keyword semantics) — a false "cannot
 * match" here would silently skip a mandatory recall. Consumed by
 * cmd-fastpath.ts against its precomputed active-trigger pattern lists.
 */
export function commandCouldMatch(
  commandPatterns: readonly string[],
  keywordPatterns: readonly string[],
  command: string,
): boolean {
  const budget: WorkBudget = { remaining: COMMAND_MATCH_BUDGET };
  const query: LessonsQuery = { command };
  return (
    commandPatterns.some((p) => {
      const matcher = getCommandMatcher(p);
      return matcher !== null && matcher.test(command, budget);
    }) || keywordPatterns.some((p) => keywordMatches(p, query))
  );
}
