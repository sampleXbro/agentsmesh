import { describe, it, expect } from 'vitest';
import { aggregateMetrics } from '../../harness/lessons-recurrence/metrics.js';
import type { CaseOutcome } from '../../harness/lessons-recurrence/types.js';

function outcome(partial: Partial<CaseOutcome>): CaseOutcome {
  return {
    caseId: 'c',
    retrieved: [],
    truePositives: [],
    falseNegatives: [],
    falsePositives: [],
    trueNegatives: [],
    ...partial,
  };
}

describe('aggregateMetrics', () => {
  it('micro-averages precision, recall, and false-positive rate across cases', () => {
    const outcomes: CaseOutcome[] = [
      outcome({
        caseId: 'a',
        truePositives: ['l1', 'l2'],
        falseNegatives: ['l3'],
        falsePositives: ['l4'],
        trueNegatives: ['l5', 'l6', 'l7'],
      }),
    ];
    const m = aggregateMetrics(outcomes);
    expect(m.cases).toBe(1);
    expect(m.truePositives).toBe(2);
    expect(m.falseNegatives).toBe(1);
    expect(m.falsePositives).toBe(1);
    expect(m.trueNegatives).toBe(3);
    expect(m.precision).toBeCloseTo(2 / 3, 10); // 2 / (2 + 1)
    expect(m.recall).toBeCloseTo(2 / 3, 10); // 2 / (2 + 1)
    expect(m.falsePositiveRate).toBeCloseTo(1 / 4, 10); // 1 / (1 + 3)
  });

  it('sums counts across multiple cases before computing ratios (micro, not macro)', () => {
    const outcomes: CaseOutcome[] = [
      outcome({ caseId: 'a', truePositives: ['l1'], falsePositives: ['l2'] }),
      outcome({
        caseId: 'b',
        truePositives: ['l3'],
        falseNegatives: ['l4'],
        trueNegatives: ['l5'],
      }),
    ];
    const m = aggregateMetrics(outcomes);
    expect(m.cases).toBe(2);
    expect(m.precision).toBeCloseTo(2 / 3, 10); // TP 2 / (TP 2 + FP 1)
    expect(m.recall).toBeCloseTo(2 / 3, 10); // TP 2 / (TP 2 + FN 1)
    expect(m.falsePositiveRate).toBeCloseTo(1 / 2, 10); // FP 1 / (FP 1 + TN 1)
  });

  it('reports a clean sheet as 1/1/0', () => {
    const m = aggregateMetrics([
      outcome({ caseId: 'a', truePositives: ['l1'], trueNegatives: ['l2', 'l3'] }),
    ]);
    expect(m.precision).toBe(1);
    expect(m.recall).toBe(1);
    expect(m.falsePositiveRate).toBe(0);
  });

  it('uses safe conventions for empty denominators (precision 1, recall 1, fpRate 0)', () => {
    expect(aggregateMetrics([])).toEqual({
      cases: 0,
      truePositives: 0,
      falseNegatives: 0,
      falsePositives: 0,
      trueNegatives: 0,
      precision: 1,
      recall: 1,
      falsePositiveRate: 0,
    });
  });

  it('a perfect-recall-but-leaky run drops precision while recall stays 1', () => {
    const m = aggregateMetrics([
      outcome({ caseId: 'a', truePositives: ['l1'], falsePositives: ['l2', 'l3'] }),
    ]);
    expect(m.recall).toBe(1);
    expect(m.precision).toBeCloseTo(1 / 3, 10);
  });
});
