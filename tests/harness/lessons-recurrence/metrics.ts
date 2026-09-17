import type { CaseOutcome, HarnessMetrics } from './types.js';

/** Ratio with an explicit value for the empty-denominator case. */
function ratio(numerator: number, denominator: number, whenEmpty: number): number {
  return denominator === 0 ? whenEmpty : numerator / denominator;
}

/**
 * Micro-average retrieval quality over case outcomes (counts summed across all
 * cases before ratios — a case with many lessons weighs more than a sparse one).
 * Empty-denominator conventions keep a degenerate suite from reading as failure:
 * precision = 1 when nothing labeled was retrieved (vacuously precise), recall =
 * 1 when nothing was expected, false-positive rate = 0 when nothing was forbidden.
 */
export function aggregateMetrics(outcomes: readonly CaseOutcome[]): HarnessMetrics {
  let tp = 0;
  let fn = 0;
  let fp = 0;
  let tn = 0;
  for (const o of outcomes) {
    tp += o.truePositives.length;
    fn += o.falseNegatives.length;
    fp += o.falsePositives.length;
    tn += o.trueNegatives.length;
  }
  return {
    cases: outcomes.length,
    truePositives: tp,
    falseNegatives: fn,
    falsePositives: fp,
    trueNegatives: tn,
    precision: ratio(tp, tp + fp, 1),
    recall: ratio(tp, tp + fn, 1),
    falsePositiveRate: ratio(fp, fp + tn, 0),
  };
}
