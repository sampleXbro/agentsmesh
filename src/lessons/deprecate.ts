import { UnknownLessonError, UnknownSupersederError } from './curation-errors.js';
import type { LessonStatus } from './graph-schema.js';
import { mutateLessonsGraph } from './mutate.js';
import { settleLineage } from './retire-lineage.js';

/** Result of a deprecate/supersede transition. */
export interface DeprecateResult {
  readonly id: string;
  readonly status: Extract<LessonStatus, 'deprecated' | 'superseded'>;
  /** The replacement lesson id when superseding, else null (plain deprecation). */
  readonly supersededBy: string | null;
}

/**
 * Retire a lesson through the shared transactional write path. With
 * `supersededBy === null` the lesson becomes `deprecated`; with a target id it
 * becomes `superseded` and records the replacement. Lessons that were already
 * superseded by this one are settled in the same write: re-pointed at the new
 * replacement, or deprecated with it, so retiring a merge target always works.
 * Throws on an unknown lesson or unknown superseder. Single source of truth for
 * both the CLI `deprecate` subcommand and the `lessons_deprecate` MCP tool —
 * neither reimplements the status transition.
 */
export async function deprecateLesson(
  projectRoot: string,
  lessonId: string,
  supersededBy: string | null,
): Promise<DeprecateResult> {
  return mutateLessonsGraph(projectRoot, (graph) => {
    const target = graph.lessons[lessonId];
    if (target === undefined) throw new UnknownLessonError(lessonId);
    if (supersededBy !== null && graph.lessons[supersededBy] === undefined) {
      throw new UnknownSupersederError(supersededBy);
    }
    settleLineage(graph, lessonId, supersededBy);
    const status = supersededBy === null ? 'deprecated' : 'superseded';
    graph.lessons[lessonId] = {
      ...target,
      status,
      ...(supersededBy === null ? {} : { supersededBy }),
    };
    return { id: lessonId, status, supersededBy };
  });
}
