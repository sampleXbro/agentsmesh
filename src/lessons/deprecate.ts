import type { LessonStatus } from './graph-schema.js';
import { mutateLessonsGraph } from './mutate.js';

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
 * becomes `superseded` and records the replacement. Throws on an unknown lesson
 * or unknown superseder. Single source of truth for both the CLI `deprecate`
 * subcommand and the `lessons_deprecate` MCP tool — neither reimplements the
 * status transition.
 */
export async function deprecateLesson(
  projectRoot: string,
  lessonId: string,
  supersededBy: string | null,
): Promise<DeprecateResult> {
  return mutateLessonsGraph(projectRoot, (graph) => {
    const target = graph.lessons[lessonId];
    if (target === undefined) throw new Error(`Unknown lesson: ${lessonId}.`);
    if (supersededBy !== null && graph.lessons[supersededBy] === undefined) {
      throw new Error(`Unknown superseder: ${supersededBy}.`);
    }
    const status = supersededBy === null ? 'deprecated' : 'superseded';
    graph.lessons[lessonId] = {
      ...target,
      status,
      ...(supersededBy === null ? {} : { supersededBy }),
    };
    return { id: lessonId, status, supersededBy };
  });
}
