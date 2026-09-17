import { describe, it, expect } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSuite, loadSuites } from '../harness/lessons-recurrence/suite.js';
import { runRecurrenceSuite } from '../harness/lessons-recurrence/evaluate.js';
import type { HarnessReport, RecurrenceSuite } from '../harness/lessons-recurrence/types.js';
import type { LessonsGraph } from '../../src/lessons/graph-schema.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SUITE_PATH = resolve(HERE, '../fixtures/lessons/recurrence/suite.json');
const HARD_SUITES_PATH = resolve(HERE, '../fixtures/lessons/recurrence/hard-suites.json');

/**
 * Operational-protection gate. Runs the REAL recall ranker against a controlled
 * planted-fault suite (never the project's own lessons graph, never the graph
 * validator) and asserts the right lesson fires at recurrence and stays silent on
 * adjacent contexts. A trigger-matching, ranking, or deprecation-exclusion
 * regression turns this red.
 */
describe('lessons recurrence harness (protection gate)', () => {
  const report: HarnessReport = runRecurrenceSuite(loadSuite(SUITE_PATH));

  function retrieved(caseId: string): readonly string[] {
    const outcome = report.outcomes.find((o) => o.caseId === caseId);
    if (!outcome) throw new Error(`no outcome for case ${caseId}`);
    return outcome.retrieved;
  }

  it('retrieves exactly the planted lesson for each recurrence context', () => {
    expect(report.outcomes).toHaveLength(6);
    expect(retrieved('edit-hooks-yaml')).toEqual(['l-hooks-yaml-doc-api']);
    expect(retrieved('edit-cli-command')).toEqual(['l-cli-forward-slash']);
    expect(retrieved('run-vitest')).toEqual(['l-tests-build-first']);
    expect(retrieved('keyword-tdd')).toEqual(['l-tdd-first']);
  });

  it('does not leak a sibling lesson into an adjacent context', () => {
    // Editing permissions.yaml must recall ONLY its own lesson — not the
    // conceptually-adjacent hooks.yaml lesson.
    expect(retrieved('edit-permissions-yaml')).toEqual(['l-permissions-yaml-merge']);
  });

  it('fires nothing on a pure-negative context', () => {
    expect(retrieved('adjacent-readme')).toEqual([]);
  });

  it('never surfaces the deprecated lesson, even on a matching trigger', () => {
    for (const outcome of report.outcomes) {
      expect(outcome.retrieved).not.toContain('l-deprecated-old-cmd');
    }
  });

  it('meets the gate: precision=1, recall=1, false-positive-rate=0, zero regressions', () => {
    expect(report.regressions).toEqual([]);
    expect(report.metrics).toEqual({
      cases: 6,
      truePositives: 5,
      falseNegatives: 0,
      falsePositives: 0,
      trueNegatives: 31,
      precision: 1,
      recall: 1,
      falsePositiveRate: 0,
    });
  });
});

/**
 * Hard suites: each isolates one ranker mechanism (specificity, topic coherence,
 * tie-break, truncation, status exclusion, multi-trigger, keyword semantics) with
 * a minimal graph and a tight top-N. A 1.0 here means the ranker DISCRIMINATES,
 * not just that disjoint triggers happen not to collide.
 */
describe('lessons recurrence harness — hard suites', () => {
  const suites = loadSuites(HARD_SUITES_PATH);
  const reports = suites.map((s) => ({ name: s.name, report: runRecurrenceSuite(s) }));

  function report(name: string): HarnessReport {
    const found = reports.find((r) => r.name === name);
    if (!found) throw new Error(`no suite ${name}`);
    return found.report;
  }
  function retrieved(suiteName: string, caseId: string): readonly string[] {
    const o = report(suiteName).outcomes.find((x) => x.caseId === caseId);
    if (!o) throw new Error(`no case ${caseId} in ${suiteName}`);
    return o.retrieved;
  }

  it('covers exactly the eight mechanism suites', () => {
    expect(suites.map((s) => s.name)).toEqual([
      'specificity-dominance',
      'topic-coherence',
      'truncation-and-tiebreak',
      'status-exclusion',
      'multi-trigger-specificity',
      'keyword-semantics',
      'bm25-tiebreak',
      'id-tiebreak',
    ]);
  });

  it.each(reports.map((r) => r.name))(
    'suite "%s" is clean (precision=1, recall=1, fpRate=0, no regressions)',
    (name) => {
      const r = report(name);
      expect(r.regressions).toEqual([]);
      expect(r.metrics.precision).toBe(1);
      expect(r.metrics.recall).toBe(1);
      expect(r.metrics.falsePositiveRate).toBe(0);
    },
  );

  it('specificity: the narrow-trigger lesson wins at topN=1', () => {
    expect(retrieved('specificity-dominance', 'narrow-beats-broad')).toEqual(['l-narrow']);
  });

  it('topic-coherence: matched-set-local coherence wins over corpus distribution (exact order)', () => {
    // No .sort(): assert the exact rank order so the createdAt tie-break (l-a1
    // newer than l-a2) is also verified, not masked.
    expect(retrieved('topic-coherence', 'matched-set-coherence-not-corpus')).toEqual([
      'l-a1',
      'l-a2',
    ]);
  });

  it('truncation+tie-break: the two newest survive, newest-first', () => {
    expect(retrieved('truncation-and-tiebreak', 'newest-two-survive-truncation')).toEqual([
      'l-1',
      'l-2',
    ]);
  });

  it('status-exclusion: only the active lesson fires (deprecated + superseded stay silent)', () => {
    expect(retrieved('status-exclusion', 'only-active-fires')).toEqual(['l-active']);
  });

  it('multi-trigger: a lesson inherits its most specific hit trigger and wins at topN=1', () => {
    expect(retrieved('multi-trigger-specificity', 'max-over-hit-triggers')).toEqual(['l-multi']);
  });

  it('bm25-tiebreak: rule-text relevance breaks an otherwise-lost tie at topN=1', () => {
    expect(retrieved('bm25-tiebreak', 'rule-text-overlap-breaks-tie')).toEqual(['l-bm-hit']);
  });

  it('id-tiebreak: the id-ascending final tie-break is deterministic at topN=1', () => {
    expect(retrieved('id-tiebreak', 'id-ascending-final-tiebreak')).toEqual(['l-id-a']);
  });

  it('keyword: contiguity, explicit whole-token, and stopword-safety all hold', () => {
    expect(retrieved('keyword-semantics', 'token-run-must-be-contiguous')).toEqual([]);
    expect(retrieved('keyword-semantics', 'token-run-contiguous-matches')).toEqual(['l-readonly']);
    expect(retrieved('keyword-semantics', 'explicit-keyword-is-token-run')).toEqual(['l-build']);
    expect(retrieved('keyword-semantics', 'explicit-keyword-is-not-substring')).toEqual([]);
    expect(retrieved('keyword-semantics', 'stopword-only-pattern-never-matches')).toEqual([]);
  });
});

/**
 * Negative control: a suite the correct ranker CANNOT pass (two active lessons on
 * the same and only trigger -> one is an unavoidable false positive). Proves the
 * harness DETECTS a leak; without this, a green gate would be meaningless.
 *
 * topN stays at 10 ON PURPOSE: the control tests leak DETECTION, so the forbidden
 * lesson must be retrieved. (A topN of 1 would return only the top lesson, hide
 * the leak, and the control would pass clean — defeating it.) Rank-sensitivity —
 * "a regression that demotes the right lesson is caught" — is covered separately
 * by the topN=1 gate cases (specificity, multi-trigger, bm25, id tie-break), where
 * a rank flip changes the single returned lesson and turns the gate red.
 */
describe('lessons recurrence harness — negative control (the gate must bite)', () => {
  const graph: LessonsGraph = {
    version: 1,
    topics: { t: { summary: 't' } },
    triggers: { only: { kind: 'file_glob', pattern: 'src/*.ts' } },
    lessons: {
      'l-a': {
        rule: 'r',
        topics: ['t'],
        triggers: ['only'],
        evidence: ['e'],
        status: 'active',
        createdAt: '2026-01-01',
      },
      'l-b': {
        rule: 'r',
        topics: ['t'],
        triggers: ['only'],
        evidence: ['e'],
        status: 'active',
        createdAt: '2026-01-01',
      },
    },
  };
  const suite: RecurrenceSuite = {
    topN: 10,
    graph,
    cases: [
      {
        id: 'unavoidable-fp',
        query: { file: 'src/x.ts' },
        shouldRetrieve: ['l-a'],
        shouldNotRetrieve: ['l-b'],
      },
    ],
  };

  it('reports the leaked lesson as a false positive and a regression', () => {
    const r = runRecurrenceSuite(suite);
    expect(r.metrics.falsePositives).toBe(1);
    expect(r.metrics.precision).toBeLessThan(1);
    expect(r.regressions).toEqual([{ caseId: 'unavoidable-fp', missed: [], leaked: ['l-b'] }]);
  });
});
