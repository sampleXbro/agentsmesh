import type { CaptureTelemetryRecord } from './capture-telemetry.js';
import { isRecord } from '../utils/types/guards.js';
import type { OutcomeEvent } from './outcome-log.js';
import type { RecallTelemetryRecord } from './telemetry.js';

/**
 * Shape guards for the lessons JSONL logs. A log is plain text that can be
 * hand-edited, merged or committed, so every reader keeps only rows with the
 * fields its consumers read. Optional fields are checked only when present,
 * so rows written before a field existed still count.
 */

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isStrList = (v: unknown): boolean => Array.isArray(v) && v.every(isStr);
const optional = (v: unknown, check: (x: unknown) => boolean): boolean =>
  v === undefined || check(v);

/** An object whose `file`, `command` and `keyword` counts are numbers. */
const isKindCounts = (v: unknown): boolean =>
  isRecord(v) && isNum(v.file) && isNum(v.command) && isNum(v.keyword);

export function isOutcomeEvent(v: unknown): v is OutcomeEvent {
  if (!isRecord(v) || !isStr(v.ts) || !isStr(v.contextKey)) return false;
  if (!optional(v.session, isStr)) return false;
  if (v.kind === 'delivered') return isStr(v.lessonId) && optional(v.rank, isNum);
  return v.kind === 'failure' && optional(v.errorClass, isStr);
}

export function isRecallRecord(v: unknown): v is RecallTelemetryRecord {
  return (
    isRecord(v) &&
    isStr(v.ts) &&
    [v.hasFile, v.hasCommand, v.hasKeyword, v.truncated].every(isBool) &&
    [v.totalMatches, v.returnedCount, v.returnedTokens].every(isNum) &&
    isKindCounts(v.matchedByKind) &&
    optional(v.contextKey, isStr) &&
    optional(v.session, isStr) &&
    optional(v.lessonIds, isStrList) &&
    optional(v.bypassed, isBool)
  );
}

export function isCaptureRecord(v: unknown): v is CaptureTelemetryRecord {
  return (
    isRecord(v) &&
    isStr(v.ts) &&
    [v.isNewLesson, v.isNewTopic, v.blocked].every(isBool) &&
    isNum(v.newTriggerCount) &&
    isKindCounts(v.triggerKinds) &&
    isStrList(v.warningCodes) &&
    optional(v.session, isStr) &&
    optional(v.lessonId, isStr)
  );
}
