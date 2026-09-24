import { effectiveness, effectivenessScore, isIneffective } from './effectiveness.js';
import type { LessonsGraph } from './graph-schema.js';
import type { OutcomeEvent } from './outcome-log.js';

/**
 * Pure aggregator over the OUTCOME log — the benefit side of the picture that
 * summarizeRecall (cost) and summarizeCapture (activity) deliberately leave out.
 * Answers "are delivered lessons actually preventing the repeat?" The signal is
 * COARSE by design (a delivery not followed by a matching failure is a weak upper
 * bound on prevention, NOT proof), so the report is labeled as such, never claims
 * a number of mistakes prevented, and shows how many distinct actions the misses
 * came from — one noisy action can otherwise dominate the rate.
 */

export interface EffectivenessStatsReport {
  /** `delivered` events — how many times lessons were injected for an action. */
  readonly deliveries: number;
  /** Distinct lessons delivered at least once. */
  readonly lessonsDelivered: number;
  /** `failure` events observed at decision points. */
  readonly failuresObserved: number;
  /** Deliveries followed by a failure the lesson's own triggers match (see effectiveness.ts). */
  readonly misses: number;
  /** Distinct failing actions behind `misses`. */
  readonly failingActions: number;
  /**
   * Coarse HELD rate: fraction of deliveries NOT followed, in the same session and
   * window, by a failure the lesson's triggers match. A weak UPPER bound on
   * prevention — the repeat may simply never have been attempted. 1 when no data.
   */
  readonly heldRate: number;
  /** Active lessons delivered >= threshold that were followed by a matching failure EVERY time. */
  readonly ineffectiveLessons: number;
}

export function summarizeEffectiveness(
  events: readonly OutcomeEvent[],
  graph: LessonsGraph,
): EffectivenessStatsReport {
  let deliveries = 0;
  let misses = 0;
  let ineffective = 0;
  const actions = new Set<string>();
  const eff = effectiveness(events, graph);
  for (const [id, outcome] of eff) {
    deliveries += outcome.delivered;
    misses += outcome.missed;
    for (const key of outcome.failingActions) actions.add(key);
    if (isIneffective(outcome, graph.lessons[id])) ineffective += 1;
  }
  return {
    deliveries,
    lessonsDelivered: eff.size,
    failuresObserved: events.filter((e) => e.kind === 'failure').length,
    misses,
    failingActions: actions.size,
    heldRate: effectivenessScore({ delivered: deliveries, missed: misses }),
    ineffectiveLessons: ineffective,
  };
}
