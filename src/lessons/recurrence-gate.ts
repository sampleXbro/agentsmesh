import { RECALL_BLOCK_CLOSE, RECALL_BLOCK_OPEN, safeRuleLine } from './rule-line.js';
import { RECURRENCE_THRESHOLD } from './capture-nudge.js';
import { contextKey } from './context-key.js';
import { loadLessonsGraphResilient } from './graph-store.js';
import { normalizeRecallFile } from './normalize-query-file.js';
import { outcomeLogExists, recordDelivered, recurringFailure } from './outcome-log.js';
import { queryLessons, type LessonsQuery } from './query.js';
import { commitSeen, openSessionDedup } from './seen-cache.js';

/**
 * Recurrence gate — the preventive counterpart to the capture nudge.
 *
 * The outcome log proves the gap this closes: lessons get DELIVERED and the same
 * action still fails again (fire-but-fail). Advisory injection alone is only as
 * strong as the agent's attention, so when a PreToolUse first-touch targets an
 * action that has ALREADY failed at least {@link RECURRENCE_THRESHOLD} times AND
 * a captured lesson covers it, recall escalates: the covering rule is re-injected
 * ABOVE the regular bullets with the failure count, and it cuts through session
 * dedup (a rule the agent saw but did not apply must be shown again). Advisory
 * only — it injects context, never a permission decision, so it degrades
 * gracefully on every hook-capable harness.
 */

/** Reserved seen-cache id prefix: one escalation per action per session. */
export const RECURRENCE_GATE_SENTINEL_PREFIX = '__recurrence-gate__:';

/** Escalation stays sharp: at most this many covering rules are re-injected. */
const ESCALATION_RULE_LIMIT = 2;

/** A lesson matching an action: its id (for dedup/telemetry) and rule text (to inject). */
export interface CoveringLesson {
  readonly id: string;
  readonly rule: string;
}

/**
 * Active lessons matching this action, id + rule. A raw graph query — NOT
 * recallLessons — so it neither runs the ranker nor writes a recall-telemetry
 * record (a coverage probe must not pollute the recall stats it feeds).
 *
 * The command is passed RAW (unlike the recurrence key, which normalizes it): a
 * `command_pattern` trigger is a regex matched against the FULL command, so
 * `/git commit -m/` must see `git commit -m 'x'`, not the normalized class
 * `git commit`. Normalizing here would make coverage lossy and fire false
 * "uncovered" escalations. The file IS normalized project-relative, so globs match.
 */
export function coveringRules(
  projectRoot: string,
  file: string | undefined,
  command: string | undefined,
): readonly CoveringLesson[] {
  const load = loadLessonsGraphResilient(projectRoot);
  if (load.status !== 'ok') return [];
  const query: LessonsQuery = {
    ...(file !== undefined ? { file: normalizeRecallFile(file, projectRoot) } : {}),
    ...(command !== undefined ? { command } : {}),
  };
  return queryLessons(load.graph, query).map((m) => ({ id: m.id, rule: m.lesson.rule }));
}

/** True when any active lesson matches this action (see {@link coveringRules}). */
export function hasCoveringLesson(
  projectRoot: string,
  file: string | undefined,
  command: string | undefined,
): boolean {
  return coveringRules(projectRoot, file, command).length > 0;
}

export interface RecurrenceGateInput {
  /** Project-relative or absolute path of the file about to be touched. */
  readonly file?: string;
  /** Raw shell command about to run. */
  readonly command?: string;
  /** Session correlator for the once-per-action-per-session guard. */
  readonly sessionId?: string;
}

/**
 * The escalation text for a recurring, covered action — or `null` when the gate
 * does not apply: no action, no failure history past the threshold, no covering
 * lesson, or already escalated for this action this session. Cheap on the hot
 * path: a missing outcome log (switched off / fresh project) exits on one stat.
 */
export function recurrenceEscalation(
  projectRoot: string,
  input: RecurrenceGateInput,
): string | null {
  if (input.file === undefined && input.command === undefined) return null;
  if (!outcomeLogExists(projectRoot)) return null;
  const key = contextKey({ file: input.file, command: input.command }, projectRoot);
  // The action key is a CLASS (`cat a` and `cat b` are both `cmd:cat`), so a raw
  // failure count cannot tell one recurring problem from unrelated failures that
  // happen to share a program. Escalate only when the SAME error recurred; with
  // no error signature we cannot claim recurrence at all, so we stay quiet.
  const { errorClass, sameClassCount } = recurringFailure(projectRoot, key);
  if (errorClass === undefined || sameClassCount < RECURRENCE_THRESHOLD) return null;
  const covering = coveringRules(projectRoot, input.file, input.command);
  if (covering.length === 0) return null;
  const dedup = openSessionDedup({ explicit: input.sessionId, projectRoot });
  const sentinel = RECURRENCE_GATE_SENTINEL_PREFIX + key;
  if (dedup !== null && dedup.seen.has(sentinel)) return null;
  const shown = covering.slice(0, ESCALATION_RULE_LIMIT);
  // The escalation preface IS this rule's delivery. Record it and mark it seen so
  // the recall body that follows (same file/command) does not re-inject the
  // identical rule — dedup only exists with a session correlator, so without one
  // we leave delivery to the body (there is no dedup to duplicate against anyway).
  if (dedup !== null) {
    recordDelivered(
      projectRoot,
      shown.map((c) => c.id),
      key,
      process.env,
      input.sessionId,
    );
    commitSeen(dedup, [sentinel, ...shown.map((c) => c.id)]);
  }
  const bullets = shown.map((c) => `- [${c.id}] ${safeRuleLine(c.rule)}`).join('\n');
  return (
    `RECURRENT FAILURE: this action has failed ${sameClassCount}× with the same error ` +
    `and a captured lesson covers it — apply the rule before retrying:\n` +
    `${RECALL_BLOCK_OPEN}\n${bullets}\n${RECALL_BLOCK_CLOSE}`
  );
}
