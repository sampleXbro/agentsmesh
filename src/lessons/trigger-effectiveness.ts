import type { LessonsGraph, TriggerKind } from './graph-schema.js';
import { keywordNeedleLosesTokens } from './keyword-signal.js';
import { tokenize } from './ranking-text.js';
import { isSafeRegexPattern } from './regex-safety.js';

/**
 * Trigger EFFECTIVENESS: can a trigger ever fire on the mandatory `--file`/`--cmd`
 * recall path? A lesson whose every trigger is ineffective there is unrecallable
 * in practice — captured, then silently lost. This is the blocking counterpart to
 * the warn-only capture guardrails: `add` rejects a capture with zero effective
 * triggers (see `addLessonInto`), where the guardrails only nudge.
 *
 * A trigger is ineffective when:
 * - `keyword`: its needle carries no matchable token after stopword filtering, or
 *   loses tokens to stopwords so the phrase can never appear as a contiguous run
 *   in `--file`/`--cmd` text (see keyword-signal.ts). NOTE this is scoped to the
 *   mandatory path — such a keyword can still fire via an explicit `--keyword`
 *   substring, which is the documented anti-pattern, not the mandatory recall.
 * - `command_pattern`: the regex is invalid (recall compiles with `new RegExp`
 *   and swallows the throw as a non-match) or outside the provably-linear engine
 *   (recall skips it to avoid ReDoS) — either way it never matches at recall.
 * - `file_glob`: NEVER flagged here. Input normalization (`add-helpers.ts`) makes
 *   syntactically-dead globs unreachable, and dead-vs-tree is a warn-only liveness
 *   concern (DEAD_GLOB / PENDING_GLOB guardrails), not a structural block.
 */

export interface IneffectiveTrigger {
  readonly id: string;
  readonly kind: TriggerKind;
  readonly pattern: string;
  readonly reason: string;
}

export function ineffectiveTriggers(
  graph: LessonsGraph,
  triggerIds: readonly string[],
): IneffectiveTrigger[] {
  const out: IneffectiveTrigger[] = [];
  for (const id of triggerIds) {
    const trigger = graph.triggers[id];
    if (trigger === undefined) continue; // dangling ref — can't classify, leave to validate
    const reason = ineffectiveReason(trigger.kind, trigger.pattern);
    if (reason !== null) out.push({ id, kind: trigger.kind, pattern: trigger.pattern, reason });
  }
  return out;
}

function ineffectiveReason(kind: TriggerKind, pattern: string): string | null {
  if (kind === 'keyword') {
    if (tokenize(pattern).length === 0) {
      return 'keyword has no matchable token after stopword filtering — it cannot fire on the mandatory --file/--cmd recall path';
    }
    if (keywordNeedleLosesTokens(pattern)) {
      return 'keyword contains stopwords/short words, so its needle can never appear as a contiguous run on the mandatory --file/--cmd recall path';
    }
    return null;
  }
  if (kind === 'command_pattern') {
    let valid = true;
    try {
      new RegExp(pattern);
    } catch {
      valid = false;
    }
    if (!valid) {
      return 'invalid regex — recall compiles it with new RegExp and swallows the throw as a non-match, so it never fires';
    }
    if (!isSafeRegexPattern(pattern)) {
      return 'regex is outside the provably-linear engine — recall skips it (ReDoS guard), so it never fires';
    }
    return null;
  }
  return null; // file_glob and any future kind: not structurally ineffective
}

/**
 * Dead triggers that should BLOCK capture (used by `addLessonInto`). This is a
 * STRICT SUBSET of {@link ineffectiveTriggers}: a `command_pattern` is excluded
 * because the transactional write barrier already rejects an invalid/unsafe
 * command regex with its own error (INVALID/UNSAFE_TRIGGER_PATTERN). Blocking it
 * here too would only pre-empt that clearer, established rejection — so the block
 * meaningfully adds only the keyword-dead case (which the write barrier passes).
 */
export function blockingDeadTriggers(
  graph: LessonsGraph,
  triggerIds: readonly string[],
): IneffectiveTrigger[] {
  return ineffectiveTriggers(graph, triggerIds).filter((t) => t.kind !== 'command_pattern');
}
