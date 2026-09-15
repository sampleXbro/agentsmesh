import type { Lesson, LessonsGraph } from './graph-schema.js';
import { collectMatchedTriggerIds, type LessonsQuery, type MatchedLesson } from './query.js';
import { buildFanout, buildNarrowness, buildTopicCoherence } from './ranking-signals.js';
import { bm25, buildCorpus, queryTerms } from './ranking-text.js';

export interface RankReason {
  readonly matchedTriggers: string[];
  readonly bm25: number;
  readonly specificity: number;
  readonly topicCoherence: number;
  /** Reached by rule wording rather than a trigger (see lexical-retrieval.ts). */
  readonly lexical?: true;
}

export interface RankedLesson {
  readonly id: string;
  readonly lesson: Lesson;
  readonly score: number;
  readonly reason: RankReason;
}

export interface RankOptions {
  /** Keep at most this many results (after ranking). */
  readonly limit?: number;
  /**
   * Best-effort token budget: keep results while their cumulative estimated
   * rule-token cost fits. The single most-relevant result is ALWAYS returned
   * even if it alone exceeds the budget — an empty recall for a matched query is
   * worse for the agent than one slightly-over-budget rule.
   */
  readonly maxTokens?: number;
  /**
   * Per-lesson effectiveness score in [0,1] from the outcome log (1 = always
   * helped; absent = neutral). Fed as a LOW-weight RRF signal so a proven
   * fire-but-fail lesson sinks below an equally-matched effective one — a
   * corrective nudge, never a driver. Empty/absent ⇒ every lesson ties on this
   * signal ⇒ ordering is unchanged from the pre-effectiveness ranker.
   */
  readonly effectiveness?: ReadonlyMap<string, number>;
}

/** Default recall cap: a broad trigger match returns the most-relevant few, not the whole topic. */
export const DEFAULT_RECALL_LIMIT = 10;

/**
 * Default recall token budget applied by the application APIs (CLI `query`, MCP
 * `lessons_query`, {@link recallLessons}) when the caller does not specify one.
 * Mandatory recall runs before every edit/command, so its payload must stay
 * lean; without a budget a broad match can return ~450+ rule-tokens. `--all`
 * (CLI) bypasses both caps. The top result is always kept (see RankOptions).
 */
export const DEFAULT_RECALL_MAX_TOKENS = 1200;

const RRF_K = 60;

/**
 * RRF signal weights. Mandatory recall fires on `--file`/`--cmd`, where the
 * discriminating signal is WHICH trigger matched and how specific it is — rule
 * prose rarely contains a file path, so raw BM25 is the noisiest signal. So
 * specificity dominates, topic coherence (a graph signal) sits in the middle,
 * and rule-text BM25 only breaks ties the structural signals cannot.
 */
// Strictly greater than TOPIC_COHERENCE + BM25 + EFFECTIVENESS, so a lesson
// that wins specificity cannot be outvoted by a clean sweep of the weaker
// signals. Mandatory recall fires on --file/--cmd, where "which trigger matched
// and how precisely" is the evidence; the rest only order what specificity ties.
const SPECIFICITY_WEIGHT = 5;
const TOPIC_COHERENCE_WEIGHT = 2;
const BM25_WEIGHT = 1;
// Effectiveness (outcome-log) is a corrective nudge, not a driver — the same low
// weight as BM25, so it only sinks a proven fire-but-fail lesson below an
// equally-matched sibling and never overrides a specificity lead. Neutral (every
// lesson equal) when the log carries no signal, so ranking is then unchanged.
const EFFECTIVENESS_WEIGHT = 1;

/**
 * Competition ranking (1,1,3,…): equal values share a rank so a signal that
 * cannot distinguish two lessons contributes equally to both — otherwise an
 * arbitrary id tie-break in one signal would silently cancel a real lead in the
 * other under RRF.
 */
function rankMap(items: { id: string; value: number }[]): Map<string, number> {
  const sorted = [...items].sort((a, b) =>
    b.value !== a.value ? b.value - a.value : a.id < b.id ? -1 : 1,
  );
  const ranks = new Map<string, number>();
  let prevValue: number | null = null;
  let prevRank = 0;
  sorted.forEach((item, i) => {
    const rank = prevValue !== null && item.value === prevValue ? prevRank : i + 1;
    ranks.set(item.id, rank);
    prevValue = item.value;
    prevRank = rank;
  });
  return ranks;
}

/** Crude rule-token estimate (≈4 chars/token) — shared by recall caps and stats. */
export function estTokens(rule: string): number {
  return Math.ceil(rule.length / 4);
}

/**
 * Rank matched lessons by relevance and apply optional caps. Three lightweight
 * signals are weighted-reciprocal-rank-fused (RRF): trigger specificity (inverse
 * fanout — a discriminating trigger beats a topic-wide one; highest weight),
 * per-query topic coherence (a lesson in the topic that dominates this query's
 * matched set is boosted; middle weight), and BM25 over the rule text (so the
 * lesson whose wording best fits breaks ties the structural signals cannot;
 * lowest weight). Ties break by recency (createdAt) then id. No embeddings, no
 * I/O — pure and sub-millisecond.
 */
export function rankLessons(
  graph: LessonsGraph,
  query: LessonsQuery,
  matches: readonly MatchedLesson[],
  options: RankOptions = {},
): RankedLesson[] {
  if (matches.length === 0) return [];

  const terms = queryTerms(query);
  const corpus = buildCorpus(graph);
  const fanout = buildFanout(graph);
  const narrowness = buildNarrowness(graph);
  const coherence = buildTopicCoherence(matches);
  const matchedTriggerIds = collectMatchedTriggerIds(graph, query);

  const scored = matches.map(({ id, lesson, lexical }) => {
    const hitTriggers = lesson.triggers.filter((t) => matchedTriggerIds.has(t));
    let specificity = 0;
    // Each hit trigger belongs to this active, matched lesson, so fanout has it.
    // Fanout alone cannot separate a pinpoint glob from a subtree glob (trigger
    // ids are content-addressed, so both are referenced once); narrowness does.
    for (const t of hitTriggers) {
      specificity = Math.max(specificity, (narrowness.get(t) ?? 1) / fanout.get(t)!);
    }
    return {
      id,
      lesson,
      bm25: bm25(terms, lesson.rule, corpus),
      specificity,
      // `id` is a matched lesson, and buildTopicCoherence keys every matched id.
      topicCoherence: coherence.get(id)!,
      matchedTriggers: hitTriggers,
      // Absent from the log ⇒ neutral 1, so a lesson with no outcome data never
      // sinks below one that has merely been recorded.
      effectiveness: options.effectiveness?.get(id) ?? 1,
      lexical,
    };
  });

  const bm25Ranks = rankMap(scored.map((s) => ({ id: s.id, value: s.bm25 })));
  const specRanks = rankMap(scored.map((s) => ({ id: s.id, value: s.specificity })));
  const topicRanks = rankMap(scored.map((s) => ({ id: s.id, value: s.topicCoherence })));
  const effRanks = rankMap(scored.map((s) => ({ id: s.id, value: s.effectiveness })));

  const ranked: RankedLesson[] = scored
    .map((s) => ({
      id: s.id,
      lesson: s.lesson,
      score:
        SPECIFICITY_WEIGHT / (RRF_K + specRanks.get(s.id)!) +
        TOPIC_COHERENCE_WEIGHT / (RRF_K + topicRanks.get(s.id)!) +
        BM25_WEIGHT / (RRF_K + bm25Ranks.get(s.id)!) +
        EFFECTIVENESS_WEIGHT / (RRF_K + effRanks.get(s.id)!),
      reason: {
        matchedTriggers: s.matchedTriggers,
        bm25: s.bm25,
        specificity: s.specificity,
        topicCoherence: s.topicCoherence,
        ...(s.lexical === true ? { lexical: true as const } : {}),
      },
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ca = a.lesson.createdAt;
      const cb = b.lesson.createdAt;
      if (ca !== cb) return ca < cb ? 1 : -1; // newer first
      return a.id < b.id ? -1 : 1;
    });

  return applyCaps(ranked, options);
}

function applyCaps(ranked: RankedLesson[], options: RankOptions): RankedLesson[] {
  let out = ranked;
  if (options.limit !== undefined && options.limit >= 0) out = out.slice(0, options.limit);
  if (options.maxTokens !== undefined && out.length > 0) {
    const budgeted: RankedLesson[] = [out[0]!]; // always keep the top result
    let used = estTokens(out[0]!.lesson.rule);
    for (const row of out.slice(1)) {
      const cost = estTokens(row.lesson.rule);
      if (used + cost > options.maxTokens) break;
      used += cost;
      budgeted.push(row);
    }
    out = budgeted;
  }
  return out;
}
