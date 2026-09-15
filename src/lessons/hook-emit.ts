import { contextKey } from './context-key.js';
import { MAX_RULE_LENGTH } from './graph-schema.js';
import { recordDelivered } from './outcome-log.js';
import { recallLessons } from './recall.js';
import type { LessonsQuery } from './query.js';

/**
 * Emission half of the tool-call recall hook, split from hook.ts for the 200-line
 * limit. Given a recall query it runs recall, applies the injection confidence
 * gate, records what was delivered (EVALUATE), and builds the harness context JSON.
 */

export interface RecallHookResult {
  /** Raw JSON to write to stdout for the harness, or '' to inject nothing. */
  readonly output: string;
}

export const EMPTY: RecallHookResult = { output: '' };

/**
 * Automatic (hook) injection is quieter than an explicit `lessons query`: cap to the
 * top few most-relevant matches so a broad diff-keyword match can't dump a long tail
 * into every edit. Results are already relevance-ranked, so the top slice is the
 * most-confident slice — a floor on injection noise, not a precision claim.
 */
export const HOOK_INJECT_LIMIT = 5;

const TRUNCATION_MARK = ' …[truncated]';

/**
 * Truncate a rule before injecting it into agent context. Capture already blocks
 * over-long rules, but a graph from a cloned third-party repo is untrusted input
 * that may carry a megabyte-scale rule (token exhaustion / context flooding) —
 * this is the last-resort bound for that path.
 */
export function clampRule(rule: string): string {
  if (rule.length <= MAX_RULE_LENGTH) return rule;
  return rule.slice(0, MAX_RULE_LENGTH - TRUNCATION_MARK.length) + TRUNCATION_MARK;
}

export interface EmitOptions {
  /** Hook event echoed back so the harness injects context for the right event. */
  readonly event: string;
  /** Lead sentence before the recalled bullets. */
  readonly lead: string;
  /** Session correlator for per-session dedup. */
  readonly sessionId: string | undefined;
  /**
   * Escalation text injected ABOVE the recall lead (recurrence gate). Unlike the
   * recall body it survives full session-dedup: when every matched lesson was
   * already delivered this session, the preface is still emitted alone.
   */
  readonly preface?: string;
}

/**
 * Run recall for `query`, gate the matches down to the most-confident few, record
 * the deliveries so a later same-action failure can impeach them (EVALUATE), and
 * build the harness's context-injection JSON — or empty output on zero matches.
 * Shared by the tool-call path and the prompt-submit path so both emit the
 * identical `hookSpecificOutput.additionalContext` shape.
 */
export async function emitRecall(
  projectRoot: string,
  query: LessonsQuery,
  options: EmitOptions,
): Promise<RecallHookResult> {
  // Cap recall AT the injection limit so per-session dedup commits EXACTLY the set we
  // inject. Ranking to the default limit and then slicing would mark the extra lessons
  // "seen" though they were never shown — permanently suppressing them next session.
  const { lessons, totalMatches, suppressed } = await recallLessons(projectRoot, query, {
    sessionId: options.sessionId,
    limit: HOOK_INJECT_LIMIT,
  });
  if (lessons.length === 0) {
    return options.preface === undefined ? EMPTY : contextOutput(options.event, options.preface);
  }
  recordDelivered(
    projectRoot,
    lessons.map((l) => l.id),
    contextKey({ file: query.file, command: query.command }, projectRoot),
    process.env,
    options.sessionId,
  );
  const body = injectionText(
    options.lead,
    lessons.map((l) => l.lesson.rule),
    hiddenByCap(totalMatches, suppressed, lessons.length),
  );
  return contextOutput(
    options.event,
    options.preface === undefined ? body : `${options.preface}\n\n${body}`,
  );
}

/**
 * Matches the caps hid, excluding the ones session dedup held back.
 *
 * Dedup suppression is by design and already silent on purpose; a match lost to
 * the token/limit cap is a tuning signal, and without it a budget too small for
 * the graph is invisible from inside a session — an agent sees two of eighteen
 * and has no way to know sixteen existed.
 */
function hiddenByCap(totalMatches: number, suppressed: number, delivered: number): number {
  return Math.max(0, totalMatches - suppressed - delivered);
}

/** The injected context body: lead sentence, clamped rule bullets, cap notice. */
function injectionText(lead: string, rules: readonly string[], hidden = 0): string {
  const bullets = rules.map((r) => `- ${clampRule(r)}`).join('\n');
  const notice =
    hidden > 0
      ? `\n(${hidden} more matched but did not fit the recall budget — raise recallMaxTokens in .agentsmesh/lessons/config.json, or narrow these lessons' triggers.)`
      : '';
  return `${lead} — apply before your next action:\n${bullets}${notice}`;
}

/** Assemble recalled rules into the harness's injection shape (clamp + bullets + lead + wrap). */
export function formatInjection(
  event: string,
  lead: string,
  rules: readonly string[],
): RecallHookResult {
  return contextOutput(event, injectionText(lead, rules));
}

/** Wrap injected context in the harness's `hookSpecificOutput` shape for `event`. */
export function contextOutput(event: string, additionalContext: string): RecallHookResult {
  return {
    output: JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext } }),
  };
}
