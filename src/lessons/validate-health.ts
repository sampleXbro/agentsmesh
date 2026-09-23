import { effectiveness, INEFFECTIVE_MIN_DELIVERIES, MISS_WINDOW_MS } from './effectiveness.js';
import type { LessonsGraph } from './graph-schema.js';
import { readOutcomeLog, type OutcomeEvent } from './outcome-log.js';
import { queryLessons, type LessonsQuery } from './query.js';
import { readRecallLog } from './telemetry.js';
import type { ValidationFinding } from './validate.js';
import { collectNeverRecalled } from './validate-never-recalled.js';

export { INEFFECTIVE_MIN_DELIVERIES } from './effectiveness.js';
export { UNUSED_MIN_RECALLS } from './validate-never-recalled.js';

/**
 * Log-derived health findings for `validate` (MAINTAIN). These read the outcome
 * and recall side-channels, so they live OUTSIDE validateLessonsGraph — that
 * function doubles as the write barrier (mutate.ts), and a log-derived warning
 * must never gate a write. Every finding is `warning` level and advisory: it
 * asks for a review, never prescribes deleting a lesson.
 *
 * The graph-shape health signals — stale (dead glob), duplicate, refine
 * (over-broad trigger) — are ALREADY emitted by validateLessonsGraph; this
 * module only adds what the logs make newly knowable.
 */

/** A contextKey failing at least this often with no covering lesson is uncovered. */
const UNCOVERED_MIN_FAILURES = 2;

export function collectHealthFindings(
  projectRoot: string,
  graph: LessonsGraph,
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const events = readOutcomeLog(projectRoot);
  if (events.length > 0) {
    collectIneffective(events, graph, findings);
    collectUncovered(events, graph, findings);
  }
  collectNeverRecalled(readRecallLog(projectRoot), graph, findings);
  return findings;
}

function collectIneffective(
  events: readonly OutcomeEvent[],
  graph: LessonsGraph,
  findings: ValidationFinding[],
): void {
  const eff = effectiveness(events, graph);
  const minutes = MISS_WINDOW_MS / 60_000;
  for (const lessonId of [...eff.keys()].sort()) {
    const outcome = eff.get(lessonId)!;
    // Delivered enough to judge, and every single delivery was a miss.
    if (outcome.delivered < INEFFECTIVE_MIN_DELIVERIES || outcome.missed < outcome.delivered)
      continue;
    if (graph.lessons[lessonId]?.status !== 'active') continue; // already retired → nothing to do
    const actions = outcome.failingActions.length;
    findings.push({
      level: 'warning',
      code: 'INEFFECTIVE_LESSON',
      lessonId,
      message:
        `Delivered ${outcome.delivered}× and each time an action its own triggers match failed ` +
        `within ${minutes} min in the same session (${actions} distinct failing ` +
        `action${actions === 1 ? '' : 's'}). The rule may be wrong, too vague, or mis-triggered — ` +
        `review this lesson: agentsmesh lessons show ${lessonId}`,
    });
  }
}

function queryFromFileKey(key: string): LessonsQuery | null {
  // Only file: keys are lossless. A cmd: key holds the normalized command CLASS
  // (flags/args stripped), which a command_pattern trigger matching the full command
  // cannot be re-checked against — so we never claim a command action is uncovered
  // here (the failure hook, which still has the raw command, judges those precisely).
  if (key.startsWith('file:')) return { file: key.slice('file:'.length) };
  return null;
}

function collectUncovered(
  events: readonly OutcomeEvent[],
  graph: LessonsGraph,
  findings: ValidationFinding[],
): void {
  const failures = new Map<string, number>();
  for (const ev of events) {
    if (ev.kind === 'failure') failures.set(ev.contextKey, (failures.get(ev.contextKey) ?? 0) + 1);
  }
  for (const key of [...failures.keys()].sort()) {
    const count = failures.get(key)!;
    if (count < UNCOVERED_MIN_FAILURES) continue;
    const query = queryFromFileKey(key);
    if (query === null || queryLessons(graph, query).length > 0) continue; // covered → skip
    findings.push({
      level: 'warning',
      code: 'UNCOVERED_FAILURE',
      message: `Failed ${count}× at ${key} with no lesson to prevent it — capture one: agentsmesh lessons add`,
    });
  }
}
