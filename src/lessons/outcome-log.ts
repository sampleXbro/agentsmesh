import { join } from 'node:path';
import { effectivenessScores } from './effectiveness.js';
import type { LessonsGraph } from './graph-schema.js';
import { appendJsonl, logExists, readJsonl } from './jsonl-log.js';
import { isOutcomeEvent } from './log-record-guards.js';
import { lessonsPaths } from './paths.js';
import { isOutcomeLogEnabled, sessionId } from './telemetry.js';

/**
 * The outcome log: an append-only side-channel (NEVER the graph, which is
 * `.strict()` + frozen) of two event kinds — a lesson delivered for an action,
 * and a failure observed on an action. Repeat-failure detection and
 * effectiveness are DERIVED from it at read time.
 *
 * ON by default, under its own switch (`"outcomeLog": false` in the lessons
 * config turns it off) — see isOutcomeLogEnabled. It holds normalized action
 * keys and normalized error classes only, never raw commands or error text.
 */

const MAX_OUTCOME_LOG_RECORDS = 5000;
const OUTCOME_LOG_TRIM_TRIGGER_BYTES = 2_000_000;

/** A lesson injected into agent context for a concrete action. */
export interface OutcomeDelivered {
  /** ISO-8601 timestamp supplied by the caller (engine never reads the wall clock). */
  readonly ts: string;
  readonly kind: 'delivered';
  readonly lessonId: string;
  /** Normalized action key — see context-key.ts. Never raw text. */
  readonly contextKey: string;
  readonly session?: string;
  /** 0-based relevance rank within its delivery batch (0 = top-ranked). */
  readonly rank?: number;
}

/** A failure observed at a decision point (the thing a lesson is meant to prevent). */
export interface OutcomeFailure {
  readonly ts: string;
  readonly kind: 'failure';
  readonly contextKey: string;
  /** Coarse class of the error (see error-class.ts) — a hint for STORE, not a key. */
  readonly errorClass?: string;
  readonly session?: string;
}

export type OutcomeEvent = OutcomeDelivered | OutcomeFailure;

/** Append-only outcome log, sibling of the graph — never the graph itself. */
export function outcomeLogPath(projectRoot: string): string {
  return join(lessonsPaths(projectRoot).base, 'outcome-log.jsonl');
}

/** Append one event — a no-op when the outcome log is switched off. */
export function appendOutcomeEvent(
  projectRoot: string,
  event: OutcomeEvent,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!isOutcomeLogEnabled(env, projectRoot)) return;
  appendJsonl(outcomeLogPath(projectRoot), event, {
    maxRecords: MAX_OUTCOME_LOG_RECORDS,
    trimTriggerBytes: OUTCOME_LOG_TRIM_TRIGGER_BYTES,
  });
}

/** Read every well-formed outcome event. Returns [] when absent or unreadable. */
export function readOutcomeLog(projectRoot: string): OutcomeEvent[] {
  return readJsonl(outcomeLogPath(projectRoot), isOutcomeEvent, {
    maxBytes: OUTCOME_LOG_TRIM_TRIGGER_BYTES,
  });
}

/** True when the outcome log file exists — distinguishes "never recorded" from "empty". */
export function outcomeLogExists(projectRoot: string): boolean {
  return logExists(outcomeLogPath(projectRoot));
}

/**
 * Record that these lessons were injected for `contextKey` (stamps ts + session +
 * per-batch rank; ids MUST arrive relevance-ranked). No-op when the log is off.
 * An explicit `session` (the harness's hook-stdin id) wins over the env fallback —
 * the env var is unset in hook deployments, which left every record session-less.
 */
export function recordDelivered(
  projectRoot: string,
  lessonIds: readonly string[],
  contextKey: string,
  env: NodeJS.ProcessEnv = process.env,
  session: string | undefined = sessionId(env),
): void {
  if (!isOutcomeLogEnabled(env, projectRoot) || lessonIds.length === 0) return;
  const ts = new Date().toISOString();
  lessonIds.forEach((lessonId, rank) => {
    appendOutcomeEvent(
      projectRoot,
      {
        ts,
        kind: 'delivered',
        lessonId,
        contextKey,
        rank,
        ...(session !== undefined ? { session } : {}),
      },
      env,
    );
  });
}

/**
 * Record a failure observed for `contextKey` (stamps ts + session). No-op when
 * the log is off. Explicit `session` wins over the env fallback (see above).
 */
export function recordFailure(
  projectRoot: string,
  contextKey: string,
  errorClass?: string,
  env: NodeJS.ProcessEnv = process.env,
  session: string | undefined = sessionId(env),
): void {
  appendOutcomeEvent(
    projectRoot,
    {
      ts: new Date().toISOString(),
      kind: 'failure',
      contextKey,
      ...(errorClass !== undefined ? { errorClass } : {}),
      ...(session !== undefined ? { session } : {}),
    },
    env,
  );
}

/** Failures older than this do not count as a recurrence. */
export const RECURRENCE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The latest error class for an action, and how many times THAT error recurred in the window. */
export interface RecurringFailure {
  /** Undefined when the harness reported no error text for any failure. */
  readonly errorClass?: string;
  readonly sameClassCount: number;
}

/**
 * The most recent error class for this action and its recurrence count.
 *
 * The action key is deliberately coarse (`cat x` and `cat y` share `cmd:cat`),
 * so a plain failure count cannot support the claim that one problem recurred —
 * six unrelated errors under one class look identical to the same error six
 * times. Counting per class is what makes "this failed before" mean something.
 */
export function recurringFailure(
  projectRoot: string,
  contextKey: string,
  now: number = Date.now(),
): RecurringFailure {
  const perClass = new Map<string, number>();
  let errorClass: string | undefined;
  for (const ev of readOutcomeLog(projectRoot)) {
    if (ev.kind !== 'failure' || ev.contextKey !== contextKey) continue;
    if (ev.errorClass === undefined) continue;
    // Old failures say nothing about a retry now; counting them all inflated the count.
    const at = Date.parse(ev.ts);
    if (!Number.isFinite(at) || now - at > RECURRENCE_WINDOW_MS) continue;
    errorClass = ev.errorClass;
    perClass.set(ev.errorClass, (perClass.get(ev.errorClass) ?? 0) + 1);
  }
  if (errorClass === undefined) return { sameClassCount: 0 };
  return { errorClass, sameClassCount: perClass.get(errorClass) ?? 0 };
}

/**
 * Per-lesson ranking scores from the written log (see effectivenessScores).
 * Empty — every lesson neutral — until the log holds both deliveries and
 * failures. `lessonIds` limits the work to the lessons the caller will rank.
 */
export function loadEffectiveness(
  projectRoot: string,
  graph: LessonsGraph,
  lessonIds?: ReadonlySet<string>,
): ReadonlyMap<string, number> {
  const all = readOutcomeLog(projectRoot);
  const events =
    lessonIds === undefined
      ? all
      : all.filter((e) => e.kind !== 'delivered' || lessonIds.has(e.lessonId));
  const kinds = new Set(events.map((e) => e.kind));
  if (!kinds.has('delivered') || !kinds.has('failure')) return new Map();
  return effectivenessScores(events, graph);
}
