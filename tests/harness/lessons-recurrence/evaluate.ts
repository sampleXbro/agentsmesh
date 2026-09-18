import type { LessonsGraph } from '../../../src/lessons/graph-schema.js';
import { queryLessons } from '../../../src/lessons/query.js';
import { rankLessons } from '../../../src/lessons/ranking.js';
import { aggregateMetrics } from './metrics.js';
import type {
  CaseOutcome,
  HarnessReport,
  RecurrenceCase,
  RecurrenceSuite,
  Regression,
} from './types.js';

/** Split labels into those present in `retrieved` (hits) and those absent (misses). */
function classify(
  retrieved: ReadonlySet<string>,
  labels: readonly string[],
): {
  hit: string[];
  miss: string[];
} {
  const hit: string[] = [];
  const miss: string[] = [];
  for (const id of labels) (retrieved.has(id) ? hit : miss).push(id);
  return { hit, miss };
}

/**
 * Run one recurrence case through the REAL recall ranker over the suite's graph,
 * capped to top-N, and classify the result in both directions: planted lessons
 * that must fire (recall) and decoy/adjacent lessons that must stay silent
 * (precision). Pure — uses only the pure `queryLessons` -> `rankLessons` path, no
 * disk, no telemetry, no graph-quality validation.
 */
export function evaluateCase(
  graph: LessonsGraph,
  testCase: RecurrenceCase,
  topN: number,
): CaseOutcome {
  const matches = queryLessons(graph, testCase.query);
  const ranked = rankLessons(graph, testCase.query, matches, { limit: topN });
  const retrieved = ranked.map((r) => r.id);
  const retrievedSet = new Set(retrieved);
  const expected = classify(retrievedSet, testCase.shouldRetrieve);
  const forbidden = classify(retrievedSet, testCase.shouldNotRetrieve);
  return {
    caseId: testCase.id,
    retrieved,
    truePositives: expected.hit,
    falseNegatives: expected.miss,
    falsePositives: forbidden.hit,
    trueNegatives: forbidden.miss,
  };
}

/**
 * Execute every case in a suite, aggregate micro-averaged metrics, and surface
 * each case that failed in either direction as an actionable regression.
 */
export function runRecurrenceSuite(suite: RecurrenceSuite): HarnessReport {
  const outcomes = suite.cases.map((c) => evaluateCase(suite.graph, c, c.topN ?? suite.topN));
  const regressions: Regression[] = outcomes
    .filter((o) => o.falseNegatives.length > 0 || o.falsePositives.length > 0)
    .map((o) => ({ caseId: o.caseId, missed: o.falseNegatives, leaked: o.falsePositives }));
  return {
    topN: suite.topN,
    metrics: aggregateMetrics(outcomes),
    outcomes,
    regressions,
  };
}
