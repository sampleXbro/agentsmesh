import { createActionMatcher } from './action-match.js';
import type { LessonsGraph } from './graph-schema.js';
import type { RecallTelemetryRecord } from './telemetry.js';
import type { ValidationFinding } from './validate.js';

/** Only a recall log at least this long can say a lesson "never" fires. */
export const UNUSED_MIN_RECALLS = 500;
/** Ids named in the NEVER_RECALLED message; the finding's `lessonIds` carries them all. */
const UNUSED_NAMED_IDS = 8;

/** Distinct action keys the recall window touched (records without one say nothing). */
function touchedActions(records: readonly RecallTelemetryRecord[]): string[] {
  const keys = new Set<string>();
  for (const r of records)
    if (r.contextKey !== undefined && r.contextKey !== 'none') keys.add(r.contextKey);
  return [...keys];
}

/**
 * Lessons whose triggers matched actions touched in the recall window, yet were
 * never delivered — outranked by the recall caps, or a trigger broader than the
 * rule. A lesson whose trigger paths were simply not touched is NOT reported:
 * silence there says nothing about the lesson. One aggregate finding, so a long
 * tail cannot flood `validate`; the ids ride on `lessonIds`. Only active,
 * non-always lessons older than the window are judged.
 */
export function collectNeverRecalled(
  records: readonly RecallTelemetryRecord[],
  graph: LessonsGraph,
  findings: ValidationFinding[],
): void {
  if (records.length < UNUSED_MIN_RECALLS) return;
  const stamps = records.map((r) => Date.parse(r.ts)).filter((t) => Number.isFinite(t));
  if (stamps.length === 0) return;
  const windowStart = Math.min(...stamps);
  const delivered = new Set(records.flatMap((r) => r.lessonIds ?? []));
  const touched = touchedActions(records);
  const matches = createActionMatcher(graph);
  const ids = Object.entries(graph.lessons)
    .filter(
      ([id, l]) =>
        l.status === 'active' &&
        l.scope !== 'always' &&
        Date.parse(l.createdAt) < windowStart &&
        !delivered.has(id) &&
        touched.some((key) => matches(id, key)),
    )
    .map(([id]) => id)
    .sort();
  if (ids.length === 0) return;
  const named = ids.slice(0, UNUSED_NAMED_IDS).join(', ');
  const more = ids.length > UNUSED_NAMED_IDS ? ` (+${ids.length - UNUSED_NAMED_IDS} more)` : '';
  findings.push({
    level: 'warning',
    code: 'NEVER_RECALLED',
    lessonIds: ids,
    message:
      `${ids.length} active lesson(s) matched actions touched in the last ${records.length} recalls ` +
      `(since ${new Date(windowStart).toISOString().slice(0, 10)}) but were never delivered: ${named}${more}. ` +
      'Other lessons outrank them under the recall caps — review each with ' +
      '`agentsmesh lessons show <id>`: sharpen the rule or narrow the trigger.',
  });
}
