import { activeTriggerIds } from './validate-liveness.js';
import type { LessonsGraph } from './graph-schema.js';
import {
  isLowSignalKeyword,
  keywordNeedleLosesTokens,
  MAX_RECOMMENDED_KEYWORD_TOKENS,
} from './keyword-signal.js';
import { tokenize } from './ranking-text.js';
import type { ValidationFinding } from './validate.js';

/**
 * `validate` checks on `keyword` triggers — the curation counterparts to the
 * capture-time LOW_SIGNAL_KEYWORD / STOPWORD_KEYWORD guardrails, so a graph
 * built before those existed still surfaces its structurally-dead keywords.
 */

/**
 * Flag keyword triggers whose pattern is too long to realistically match recall
 * (see keyword-signal.ts). Only triggers referenced by an ACTIVE lesson are
 * reported: a long keyword on a superseded/deprecated lesson never recalls
 * anyway, and an unreferenced one is already an ORPHAN_TRIGGER. This is the
 * `validate` counterpart to the capture-time LOW_SIGNAL_KEYWORD guardrail, so a
 * graph built before the guardrail existed still surfaces its dead keywords.
 */
export function collectLowSignalKeywords(graph: LessonsGraph, findings: ValidationFinding[]): void {
  const active = activeTriggerIds(graph);
  for (const [triggerId, trigger] of Object.entries(graph.triggers)) {
    if (trigger.kind !== 'keyword') continue;
    if (!active.has(triggerId)) continue;
    if (!isLowSignalKeyword(trigger.pattern)) continue;
    findings.push({
      level: 'warning',
      code: 'LOW_SIGNAL_KEYWORD',
      message: `Keyword trigger "${triggerId}" carries more than ${MAX_RECOMMENDED_KEYWORD_TOKENS} tokens (${trigger.pattern}); recall matches a keyword only as a contiguous token-run in --keyword or the file/command, so it rarely fires — use a short distinctive phrase.`,
      triggerId,
    });
  }
}

/**
 * Flag keyword triggers (referenced by an ACTIVE lesson) whose needle cannot fire
 * on the mandatory `--file`/`--cmd` recall path: either it tokenizes to nothing
 * (all stopwords) or it loses tokens to stopword filtering so the phrase can never
 * appear as a contiguous run in file/command text (see keyword-signal.ts). This is
 * the `validate` counterpart to the capture-time STOPWORD_KEYWORD guardrail — and,
 * for a single dead keyword, to the UNRECALLABLE_LESSON block — so a graph built
 * before those existed still surfaces its structurally-dead keywords. Warn-only:
 * such a keyword can still fire via an explicit `--keyword` substring.
 */
export function collectStopwordKeywords(graph: LessonsGraph, findings: ValidationFinding[]): void {
  const active = activeTriggerIds(graph);
  for (const [triggerId, trigger] of Object.entries(graph.triggers)) {
    if (trigger.kind !== 'keyword') continue;
    if (!active.has(triggerId)) continue;
    if (tokenize(trigger.pattern).length !== 0 && !keywordNeedleLosesTokens(trigger.pattern)) {
      continue;
    }
    findings.push({
      level: 'warning',
      code: 'STOPWORD_KEYWORD',
      message: `Keyword trigger "${triggerId}" (${trigger.pattern}) loses tokens to stopword filtering, so its needle can never appear as a contiguous run on the mandatory --file/--cmd recall path — drop the stopwords (e.g. "state art" instead of "state of the art"), or detach it with \`lessons untrigger\`.`,
      triggerId,
    });
  }
}
