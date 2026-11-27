import {
  LastTriggerError,
  TriggerNotAttachedError,
  UnknownLessonError,
} from './curation-errors.js';
import type { LessonsGraph } from './graph-schema.js';

/**
 * Remove a single trigger from a lesson in place — the clean way to fix a bad
 * trigger (e.g. a LOW_SIGNAL_KEYWORD pattern) without the deprecate→re-add dance,
 * which would rename the lesson, leave a deprecated corpse, and reset createdAt.
 *
 * After detaching the reference, the trigger NODE is garbage-collected when no
 * lesson references it anymore (mirroring prune's dead-trigger cleanup), so no
 * ORPHAN_TRIGGER is left behind. Call inside `mutateLessonsGraph` so the write
 * stays transactional.
 */

export interface UntriggerResult {
  readonly lessonId: string;
  readonly triggerId: string;
  /** True when the trigger node was removed from the table (no remaining references). */
  readonly removedTriggerNode: boolean;
  /** Triggers the lesson still carries after the removal. */
  readonly remainingTriggerCount: number;
}

export function untriggerLesson(
  graph: LessonsGraph,
  lessonId: string,
  triggerId: string,
): UntriggerResult {
  const lesson = graph.lessons[lessonId];
  if (lesson === undefined) throw new UnknownLessonError(lessonId);
  if (!lesson.triggers.includes(triggerId)) throw new TriggerNotAttachedError(lessonId, triggerId);
  // An active triggered lesson with zero triggers can never be recalled (UNREACHABLE_LESSON).
  // Inactive lessons are never recalled, and always-on lessons need no trigger.
  if (lesson.status === 'active' && lesson.scope !== 'always' && lesson.triggers.length <= 1) {
    throw new LastTriggerError(lessonId);
  }

  const remaining = lesson.triggers.filter((t) => t !== triggerId);
  graph.lessons[lessonId] = { ...lesson, triggers: remaining };

  const stillReferenced = Object.values(graph.lessons).some((l) => l.triggers.includes(triggerId));
  let removedTriggerNode = false;
  if (!stillReferenced) {
    delete graph.triggers[triggerId];
    removedTriggerNode = true;
  }

  return { lessonId, triggerId, removedTriggerNode, remainingTriggerCount: remaining.length };
}
