import { RECURRENCE_THRESHOLD } from './capture-nudge.js';
import { contextKey } from './context-key.js';
import { loadLessonsGraphResilient } from './graph-store.js';
import { normalizeRecallFile } from './normalize-query-file.js';
import { outcomeLogExists, recordDelivered, recurringFailure } from './outcome-log.js';
import { queryLessons, type LessonsQuery } from './query.js';
import {
  capRulePayload,
  MAX_RECALL_PAYLOAD_CHARS,
  RECALL_BLOCK_CLOSE,
  RECALL_BLOCK_OPEN,
  safeRuleLine,
} from './rule-line.js';
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

/** Escalation stays sharp: at most this many covering rules per action are re-injected. */
const ESCALATION_RULE_LIMIT = 2;

/** The warning's share of the payload cap; the rest is left for the recall body and notices. */
const ESCALATION_MAX_CHARS = MAX_RECALL_PAYLOAD_CHARS / 2;

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

/** One action of a tool call: a touched file and/or the raw command about to run. */
export interface RecurrenceAction {
  readonly file?: string;
  readonly command?: string;
}

/** The warning for one tool call and the rule ids it injected. */
export interface Escalation {
  readonly text: string;
  /** Already delivered by the warning: the recall body must not repeat them. */
  readonly ruleIds: readonly string[];
}

interface RecurringAction {
  readonly key: string;
  readonly count: number;
  readonly covering: readonly CoveringLesson[];
}

/** The action's failure history past the threshold and its covering rules, or null. */
function recurringAction(projectRoot: string, action: RecurrenceAction): RecurringAction | null {
  if (action.file === undefined && action.command === undefined) return null;
  const key = contextKey({ file: action.file, command: action.command }, projectRoot);
  // The action key is a CLASS (`cat a` and `cat b` are both `cmd:cat`), so a raw
  // failure count cannot tell one recurring problem from unrelated failures that
  // happen to share a program. Escalate only when the SAME error recurred; with
  // no error signature we cannot claim recurrence at all, so we stay quiet.
  const { errorClass, sameClassCount } = recurringFailure(projectRoot, key);
  if (errorClass === undefined || sameClassCount < RECURRENCE_THRESHOLD) return null;
  const covering = coveringRules(projectRoot, action.file, action.command);
  if (covering.length === 0) return null;
  return { key, count: sameClassCount, covering: covering.slice(0, ESCALATION_RULE_LIMIT) };
}

function header(warned: readonly RecurringAction[]): string {
  if (warned.length === 1) {
    return (
      `RECURRENT FAILURE: this action has failed ${warned[0]!.count}× with the same error ` +
      `and a captured lesson covers it — apply the rule before retrying:`
    );
  }
  const most = Math.max(...warned.map((r) => r.count));
  return (
    `RECURRENT FAILURE: ${warned.length} of the files in this change have failed up to ` +
    `${most}× with the same error and captured lessons cover them — apply the rules before retrying:`
  );
}

/**
 * ONE warning for all recurring, covered actions of a tool call — or `null` when
 * the gate does not apply: no action, no failure history past the threshold, no
 * covering lesson, or already escalated for each action this session. A rule
 * covering several files of a patch is shown once, and the rules share half the
 * recall payload cap so the recall body still fits. Cheap on the hot path: a
 * missing outcome log (switched off / fresh project) exits on one stat.
 */
export function recurrenceEscalation(
  projectRoot: string,
  actions: readonly RecurrenceAction[],
  sessionId?: string,
): Escalation | null {
  if (!outcomeLogExists(projectRoot)) return null;
  const byKey = new Map<string, RecurringAction>();
  for (const action of actions) {
    const r = recurringAction(projectRoot, action);
    if (r !== null && !byKey.has(r.key)) byKey.set(r.key, r);
  }
  if (byKey.size === 0) return null;
  const dedup = openSessionDedup({ explicit: sessionId, projectRoot });
  const recurring = [...byKey.values()].filter(
    (r) => dedup === null || !dedup.seen.has(RECURRENCE_GATE_SENTINEL_PREFIX + r.key),
  );
  const rules = new Map(recurring.flatMap((r) => r.covering.map((c) => [c.id, c] as const)));
  const lines = [...rules.values()].map((c) => ({
    id: c.id,
    line: `- [${c.id}] ${safeRuleLine(c.rule)}`,
  }));
  const { kept } = capRulePayload(lines, (l) => l.line.length + 1, ESCALATION_MAX_CHARS);
  const shown = new Set(kept.map((l) => l.id));
  const warned = recurring.filter((r) => r.covering.some((c) => shown.has(c.id)));
  if (warned.length === 0) return null;
  // The warning IS the delivery of its rules: record each against its own action,
  // and mark it seen so the recall body that follows does not re-inject it.
  for (const r of warned) {
    const ids = r.covering.filter((c) => shown.has(c.id)).map((c) => c.id);
    recordDelivered(projectRoot, ids, r.key, process.env, sessionId);
  }
  if (dedup !== null) {
    commitSeen(dedup, [...warned.map((r) => RECURRENCE_GATE_SENTINEL_PREFIX + r.key), ...shown]);
  }
  const bullets = kept.map((l) => l.line).join('\n');
  return {
    text: `${header(warned)}\n${RECALL_BLOCK_OPEN}\n${bullets}\n${RECALL_BLOCK_CLOSE}`,
    ruleIds: [...shown],
  };
}
