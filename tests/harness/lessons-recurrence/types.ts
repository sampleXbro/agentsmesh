import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import type { LessonsQuery } from '../../../src/lessons/query.js';

/**
 * One planted-fault recurrence case: a recall context plus the lessons that MUST
 * fire (planted faults) and the lessons that MUST stay silent (decoys, adjacent
 * negatives, deprecated lessons). Together `shouldRetrieve` and
 * `shouldNotRetrieve` label EVERY lesson in the suite graph (enforced by the
 * loader), so both directions of precision/recall are always measured.
 */
export interface RecurrenceCase {
  readonly id: string;
  readonly description?: string;
  readonly query: LessonsQuery;
  /**
   * Per-case top-N override. Falls back to the suite's `topN` when omitted. A
   * discrimination case (specificity, tie-break, truncation) needs a tight `topN`
   * — at a loose cap every matched lesson is retrieved, so a matched lesson can
   * never be a forbidden one and the ranking order is never exercised.
   */
  readonly topN?: number;
  /** Lesson ids that must appear in the top-N (catch / recall direction). */
  readonly shouldRetrieve: readonly string[];
  /** Lesson ids that must NOT appear (decoy / adjacent / false-positive direction). */
  readonly shouldNotRetrieve: readonly string[];
}

/**
 * A self-contained recurrence suite: a controlled graph plus its cases. The graph
 * is authored independently of the graph-quality validator's distribution, so the
 * harness measures retrieval discriminability — not graph hygiene.
 */
export interface RecurrenceSuite {
  /** Default top-N cap applied to ranked recall before classification (cases may override). */
  readonly topN: number;
  readonly graph: LessonsGraph;
  readonly cases: readonly RecurrenceCase[];
}

/** A named suite, for fixture files that bundle several isolated mechanism suites. */
export interface NamedRecurrenceSuite extends RecurrenceSuite {
  readonly name: string;
}

/** Per-case retrieval outcome, classified in both directions. */
export interface CaseOutcome {
  readonly caseId: string;
  /** Top-N retrieved lesson ids, in rank order. */
  readonly retrieved: readonly string[];
  /** Expected lessons that were retrieved. */
  readonly truePositives: readonly string[];
  /** Expected lessons that were missed. */
  readonly falseNegatives: readonly string[];
  /** Forbidden lessons that leaked into the result. */
  readonly falsePositives: readonly string[];
  /** Forbidden lessons that were correctly kept out. */
  readonly trueNegatives: readonly string[];
}

/** Aggregate retrieval quality across all cases (micro-averaged). */
export interface HarnessMetrics {
  readonly cases: number;
  readonly truePositives: number;
  readonly falseNegatives: number;
  readonly falsePositives: number;
  readonly trueNegatives: number;
  /** TP / (TP + FP) — of labeled lessons retrieved, the fraction that were correct. */
  readonly precision: number;
  /** TP / (TP + FN) — catch rate on planted-fault recurrence. */
  readonly recall: number;
  /** FP / (FP + TN) — fire rate on adjacent contexts that should stay silent. */
  readonly falsePositiveRate: number;
}

/** A case that failed in either direction — actionable harness output. */
export interface Regression {
  readonly caseId: string;
  /** Expected but not retrieved (false negatives). */
  readonly missed: readonly string[];
  /** Forbidden but retrieved (false positives). */
  readonly leaked: readonly string[];
}

/** Full harness result: aggregate metrics, per-case detail, and regressions. */
export interface HarnessReport {
  readonly topN: number;
  readonly metrics: HarnessMetrics;
  readonly outcomes: readonly CaseOutcome[];
  readonly regressions: readonly Regression[];
}
