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
  if (lesson === undefined) throw new Error(`Unknown lesson: ${lessonId}.`);
  if (!lesson.triggers.includes(triggerId)) {
    throw new Error(`Lesson "${lessonId}" does not reference trigger "${triggerId}".`);
  }
  // An active lesson with zero triggers can never be recalled (UNREACHABLE_LESSON).
  // Inactive lessons are never recalled regardless, so allow stripping their last one.
  if (lesson.status === 'active' && lesson.triggers.length <= 1) {
    throw new Error(
      `Refusing to remove the only trigger of active lesson "${lessonId}" — it would become unreachable. Add a replacement trigger first (lessons add "<same rule>" --topic ...), then untrigger.`,
    );
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
