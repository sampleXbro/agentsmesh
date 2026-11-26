import { maybeAutoMigrateLessons } from './auto-migrate.js';
import type { Lesson, LessonsGraph } from './graph-schema.js';
import { loadLessonsGraphResilient } from './graph-store.js';
import { collectAlwaysLessons } from './query.js';
import { estTokens } from './ranking.js';
import { commitSeen, filterUnseen, openSessionDedup } from './seen-cache.js';

/**
 * Always-on lesson recall.
 *
 * `scope: 'always'` lessons are universal standards delivered on EVERY task, not
 * matched by triggers — so unlike {@link recallLessons} there is no query. This
 * returns the active always-lessons, newest-first, bounded by a token budget so
 * the always-set stays a lean, standing context cost. The `UserPromptSubmit` hook
 * unions these into its injection; `lessons query --always` / `lessons_query`
 * (scope) return them for targets that pull recall via CLI/MCP.
 */

/** Default cumulative rule-token budget for the always-on set. */
export const DEFAULT_ALWAYS_MAX_TOKENS = 600;

export interface AlwaysLesson {
  readonly id: string;
  readonly rule: string;
}

export interface AlwaysRecallResult {
  /** Always-on lessons within budget, newest-first. */
  readonly lessons: AlwaysLesson[];
  /** Total active always-lessons before the token cap (so callers can note drops). */
  readonly total: number;
  /** Always-lessons hidden because this session already received them. */
  readonly suppressed: number;
  /** Why the legacy auto-migration failed — see RecallResult.migrationError. */
  readonly migrationError?: string;
}

export interface AlwaysRecallOptions {
  readonly maxTokens?: number | null;
  readonly sessionId?: string;
  /** Skip session dedup: deliver already-seen lessons and mark nothing seen. */
  readonly noDedup?: boolean;
  /** Bound suppression for callers with no context-reset signal — see RecallOptions.ttlMs. */
  readonly ttlMs?: number;
}

export async function recallAlwaysLessons(
  projectRoot: string,
  options: AlwaysRecallOptions & {
    /** Migrate a legacy store first (default); see RecallOptions.autoMigrate. */
    readonly autoMigrate?: boolean;
  } = {},
): Promise<AlwaysRecallResult> {
  // Mirror recallLessons: migrate if needed, and never throw on a blocking path.
  let migrationError: string | undefined;
  try {
    if (options.autoMigrate !== false) await maybeAutoMigrateLessons(projectRoot);
  } catch (err) {
    // Degrade to whatever graph state exists, and say why.
    migrationError = err instanceof Error ? err.message : String(err);
  }
  const load = loadLessonsGraphResilient(projectRoot);
  const { lessons, total, suppressed } =
    load.status === 'ok'
      ? selectAlwaysLessons(projectRoot, load.graph, options)
      : { lessons: [], total: 0, suppressed: 0 };
  const result: AlwaysRecallResult = {
    lessons: lessons.map(({ id, rule }) => ({ id, rule })),
    total,
    suppressed,
  };
  return migrationError === undefined ? result : { ...result, migrationError };
}

/** An always-on lesson chosen for delivery, with the lesson itself for full metadata. */
export interface SelectedAlways extends AlwaysLesson {
  readonly lesson: Lesson;
}

/**
 * Pick the always-on lessons to deliver from a graph the caller already loaded
 * (shared with the CLI): newest-first, deduped per session, within the token
 * budget. Commits only the lessons it returns.
 */
export function selectAlwaysLessons(
  projectRoot: string,
  graph: LessonsGraph,
  options: AlwaysRecallOptions = {},
): { lessons: SelectedAlways[]; total: number; suppressed: number } {
  const all = collectAlwaysLessons(graph);
  const total = all.length;
  // Per-session dedup (same as keyword recall): an always-lesson is injected at
  // most once per session, so re-prompting does not re-inject the whole set.
  const dedup = openSessionDedup({
    explicit: options.sessionId,
    disabled: options.noDedup,
    projectRoot,
    ...(options.ttlMs !== undefined ? { ttlMs: options.ttlMs } : {}),
  });
  const fresh = dedup === null ? all : filterUnseen(dedup, all);
  const budget =
    options.maxTokens === null ? undefined : (options.maxTokens ?? DEFAULT_ALWAYS_MAX_TOKENS);

  const lessons = withinTokenBudget(
    fresh.map(({ id, lesson }) => ({ id, rule: lesson.rule, lesson })),
    budget,
  );
  if (dedup !== null)
    commitSeen(
      dedup,
      lessons.map((l) => l.id),
    );
  return { lessons, total, suppressed: total - fresh.length };
}

/** Leading items whose summed rule tokens fit `budget`; the first always stays. */
export function withinTokenBudget<T extends { readonly rule: string }>(
  items: readonly T[],
  budget: number | undefined,
): T[] {
  const kept: T[] = [];
  let used = 0;
  for (const item of items) {
    const cost = estTokens(item.rule);
    if (budget !== undefined && kept.length > 0 && used + cost > budget) break;
    used += cost;
    kept.push(item);
  }
  return kept;
}
