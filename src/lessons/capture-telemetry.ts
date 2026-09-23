import { join } from 'node:path';
import type { AddLessonResult } from './add.js';
import { appendJsonl, logExists, readJsonl } from './jsonl-log.js';
import { isCaptureRecord } from './log-record-guards.js';
import { lessonsPaths } from './paths.js';
import { isTelemetryEnabled, sessionId } from './telemetry.js';

/**
 * Opt-in capture telemetry — the symmetric counterpart to recall telemetry.
 *
 * Recall has a `PostToolUse` hook + telemetry + `stats`; capture had nothing, so
 * a maintainer could not tell whether lessons were being captured or silently
 * skipped/blocked. This log mirrors the recall log: one append-only record per
 * `lessons add` (CLI or MCP), gated on the SAME opt-in switch (`"telemetry": true`
 * in the lessons config, or `AGENTSMESH_LESSONS_TELEMETRY=1`), recording
 * presence/counts ONLY (never the rule text) so it leaks no source content.
 */

/** Keep at most this many capture records; older ones drop on truncation. */
export const MAX_CAPTURE_LOG_RECORDS = 5000;

/** Byte size past which the capture log self-truncates (mirrors the recall log). */
const CAPTURE_LOG_TRIM_TRIGGER_BYTES = 2_000_000;

/** Per-capture telemetry row. One JSON object per line in {@link captureLogPath}. */
export interface CaptureTelemetryRecord {
  /** ISO-8601 timestamp supplied by the recorder. */
  readonly ts: string;
  /** True for a brand-new lesson; false for an upsert onto an existing rule. */
  readonly isNewLesson: boolean;
  /** True when this capture also created the topic. */
  readonly isNewTopic: boolean;
  /** New trigger nodes this capture added to the graph. */
  readonly newTriggerCount: number;
  /** Trigger kinds PASSED to this capture (from the input — known even when blocked). */
  readonly triggerKinds: {
    readonly file: number;
    readonly command: number;
    readonly keyword: number;
  };
  /** True when the capture was REJECTED (no effective trigger, unknown topic, write-barrier, …). */
  readonly blocked: boolean;
  /** Non-blocking guardrail codes on the resulting lesson (empty when blocked). */
  readonly warningCodes: readonly string[];
  /** Session correlator from `AGENTSMESH_SESSION_ID`, when set. */
  readonly session?: string;
  /** Id of the resulting lesson — absent on a blocked capture. */
  readonly lessonId?: string;
}

/** Counts of triggers passed to a capture, by kind. */
export interface CaptureTriggerKinds {
  readonly file: number;
  readonly command: number;
  readonly keyword: number;
}

/** Append-only JSONL capture log. Sibling of the recall log and the graph. */
export function captureLogPath(projectRoot: string): string {
  return join(lessonsPaths(projectRoot).base, 'capture-log.jsonl');
}

/** Append one capture record — a no-op unless telemetry is enabled. */
export function appendCaptureRecord(
  projectRoot: string,
  record: CaptureTelemetryRecord,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!isTelemetryEnabled(env, projectRoot)) return;
  appendJsonl(captureLogPath(projectRoot), record, {
    maxRecords: MAX_CAPTURE_LOG_RECORDS,
    trimTriggerBytes: CAPTURE_LOG_TRIM_TRIGGER_BYTES,
  });
}

/** True when a capture log exists — distinguishes "never recorded" from "empty". */
export function captureLogExists(projectRoot: string): boolean {
  return logExists(captureLogPath(projectRoot));
}

/** Read every well-formed capture record. Returns [] when absent or unreadable. */
export function readCaptureLog(projectRoot: string): CaptureTelemetryRecord[] {
  return readJsonl(captureLogPath(projectRoot), isCaptureRecord, {
    maxBytes: CAPTURE_LOG_TRIM_TRIGGER_BYTES,
  });
}

/**
 * Build and append a capture record from the (possibly null) result. Pass
 * `result = null` to record a BLOCKED capture — the kinds attempted are still
 * known from the input, so a rejected capture stays visible to `stats`. Gated,
 * so the capture path computes nothing in the default-off config.
 */
export function recordCapture(
  projectRoot: string,
  triggerKinds: CaptureTriggerKinds,
  result: AddLessonResult | null,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!isTelemetryEnabled(env, projectRoot)) return;
  const session = sessionId(env);
  appendCaptureRecord(
    projectRoot,
    {
      ts: new Date().toISOString(),
      isNewLesson: result?.isNewLesson ?? false,
      isNewTopic: result?.isNewTopic ?? false,
      newTriggerCount: result?.newTriggerIds.length ?? 0,
      triggerKinds,
      blocked: result === null,
      warningCodes: result?.warnings.map((w) => w.code) ?? [],
      ...(session !== undefined ? { session } : {}),
      ...(result !== null ? { lessonId: result.id } : {}),
    },
    env,
  );
}
