import type { LessonsGraph } from './graph-schema.js';

/**
 * Superseded lessons that reach `retiredId` through `supersededBy`, directly or
 * down a chain, nearest first. `successorId` is left out (and not followed) so a
 * retire can never point a lesson at itself: a bad successor stays a cycle for
 * the write barrier to refuse.
 */
function lineageOf(graph: LessonsGraph, retiredId: string, successorId: string | null): string[] {
  const dependents = new Map<string, string[]>();
  for (const [id, lesson] of Object.entries(graph.lessons)) {
    if (lesson.status !== 'superseded' || lesson.supersededBy === undefined) continue;
    dependents.set(lesson.supersededBy, [...(dependents.get(lesson.supersededBy) ?? []), id]);
  }
  const seen = new Set<string>([retiredId]);
  if (successorId !== null) seen.add(successorId);
  const queue = [retiredId];
  for (let i = 0; i < queue.length; i += 1) {
    for (const child of dependents.get(queue[i]!) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      queue.push(child);
    }
  }
  return queue.slice(1);
}

/**
 * Settle every lesson that was superseded by `retiredId` as it leaves the active
 * set, in the same transaction, so no lesson is left pointing at a dead end.
 *
 * - With a successor, each is re-pointed at it, so chains fold and still end at a
 *   live lesson.
 * - Without one, each becomes `deprecated` and keeps `supersededBy` as history:
 *   the whole lineage is retired, and a deprecated chain is valid.
 */
export function settleLineage(
  graph: LessonsGraph,
  retiredId: string,
  successorId: string | null,
): void {
  for (const id of lineageOf(graph, retiredId, successorId)) {
    const lesson = graph.lessons[id]!;
    graph.lessons[id] =
      successorId === null
        ? { ...lesson, status: 'deprecated' }
        : { ...lesson, supersededBy: successorId };
  }
}
