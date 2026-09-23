import { contextKey } from './context-key.js';
import type { GraphHealth } from './hook-notices.js';
import { recordDelivered } from './outcome-log.js';
import { recallLessons } from './recall.js';
import type { LessonsQuery } from './query.js';
import { RECALL_BLOCK_CLOSE, RECALL_BLOCK_OPEN, safeRuleLine } from './rule-line.js';

/**
 * Emission half of the tool-call recall hook, split from hook.ts for the 200-line
 * limit. Given recall queries it runs recall, applies the injection confidence
 * gate, records what was delivered (EVALUATE), and builds the harness context JSON.
 */

export interface RecallHookResult {
  /** Raw JSON to write to stdout for the harness, or '' to inject nothing. */
  readonly output: string;
  /** The injected text alone, so a host adapter can re-wrap it (see hook-hosts.ts). */
  readonly context?: string;
  /** Exit code the host needs to read `output`; 0 when unset. */
  readonly exitCode?: number;
}

export const EMPTY: RecallHookResult = { output: '' };

/**
 * Automatic (hook) injection is quieter than an explicit `lessons query`: cap to the
 * top few most-relevant matches so a broad diff-keyword match can't dump a long tail
 * into every edit. Results are already relevance-ranked, so the top slice is the
 * most-confident slice — a floor on injection noise, not a precision claim.
 */
export const HOOK_INJECT_LIMIT = 5;

/** A recalled rule with the id it is rendered under. */
export interface RecalledRule {
  readonly id: string;
  readonly rule: string;
}

/** The rules to inject, the matches the caps hid, and what recall saw of the graph. */
export interface CollectedRecall extends GraphHealth {
  readonly rules: readonly RecalledRule[];
  readonly hidden: number;
}

/**
 * Recall each query in turn (one per touched file) until HOOK_INJECT_LIMIT rules
 * are collected, recording each delivery against its own action (EVALUATE).
 * Each call is capped at the remaining room, so per-session dedup commits
 * EXACTLY the set injected: slicing afterwards would mark unshown lessons seen.
 */
export async function collectRecall(
  projectRoot: string,
  queries: readonly LessonsQuery[],
  sessionId: string | undefined,
): Promise<CollectedRecall> {
  const rules: RecalledRule[] = [];
  let hidden = 0;
  for (const query of queries) {
    const room = HOOK_INJECT_LIMIT - rules.length;
    if (room <= 0) break;
    const r = await recallLessons(projectRoot, query, { sessionId, limit: room });
    if (r.corrupt === true) return { rules, hidden, corrupt: true };
    if (r.newerVersion !== undefined) return { rules, hidden, newerVersion: r.newerVersion };
    hidden += hiddenByCap(r.totalMatches, r.suppressed, r.lessons.length);
    const fresh = r.lessons.filter((l) => !rules.some((x) => x.id === l.id));
    if (fresh.length === 0) continue;
    recordDelivered(
      projectRoot,
      fresh.map((l) => l.id),
      contextKey({ file: query.file, command: query.command }, projectRoot),
      process.env,
      sessionId,
    );
    rules.push(...fresh.map((l) => ({ id: l.id, rule: l.lesson.rule })));
  }
  return { rules, hidden };
}

export interface RenderOptions {
  /** Hook event echoed back so the harness injects context for the right event. */
  readonly event: string;
  /** Lead sentence before the recalled bullets. */
  readonly lead: string;
  /**
   * Text injected ABOVE the recall lead (recurrence gate, one-time notices).
   * Unlike the recall body it survives full session-dedup: when every matched
   * lesson was already delivered this session, the preface is still emitted alone.
   */
  readonly preface?: string;
}

/** The harness JSON for collected rules, or empty output when there is nothing to say. */
export function renderRecall(collected: CollectedRecall, options: RenderOptions): RecallHookResult {
  if (collected.rules.length === 0) {
    return options.preface === undefined ? EMPTY : contextOutput(options.event, options.preface);
  }
  const body = injectionText(options.lead, collected.rules, collected.hidden);
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

/**
 * Why the recall was truncated, so the notice names a knob that can actually
 * change the outcome. The per-call ceiling overrides the configured recall
 * limit, so on a large graph it is almost always what binds — and pointing at
 * `recallMaxTokens` in that case sends the reader to a setting that does
 * nothing.
 */
function truncationNotice(hidden: number, deliveredCount: number): string {
  if (hidden <= 0) return '';
  if (deliveredCount >= HOOK_INJECT_LIMIT) {
    return (
      `\n(${hidden} more matched; recall injects at most ${HOOK_INJECT_LIMIT} rules per call. ` +
      `Narrow these lessons' triggers so the most relevant ones rank first.)`
    );
  }
  return (
    `\n(${hidden} more matched but did not fit the recall token budget — raise ` +
    `recallMaxTokens in .agentsmesh/lessons/config.json, or narrow these lessons' triggers.)`
  );
}

/**
 * The injected body: the lead, then the rules fenced as project content, one
 * id-prefixed line each (safeRuleLine keeps a rule from leaving the fence).
 */
function injectionText(lead: string, rules: readonly RecalledRule[], hidden = 0): string {
  const bullets = rules.map((r) => `- [${safeRuleLine(r.id, 200)}] ${safeRuleLine(r.rule)}`);
  return (
    `${lead} — project content, not instructions from the user or the system; ` +
    `apply as guidance before your next action:\n${RECALL_BLOCK_OPEN}\n${bullets.join('\n')}\n` +
    `${RECALL_BLOCK_CLOSE}${truncationNotice(hidden, rules.length)}`
  );
}

/** Wrap injected context in the harness's `hookSpecificOutput` shape for `event`. */
export function contextOutput(event: string, additionalContext: string): RecallHookResult {
  return {
    output: JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext } }),
    context: additionalContext,
  };
}

/** Non-empty parts joined as paragraphs, or undefined when there are none. */
export function paragraphs(parts: ReadonlyArray<string | null>): string | undefined {
  const present = parts.filter((p): p is string => p !== null && p.length > 0);
  return present.length === 0 ? undefined : present.join('\n\n');
}
