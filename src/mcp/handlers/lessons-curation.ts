import type { McpContext } from '../context.js';
import { McpError } from '../errors.js';
import { maybeAutoMigrateLessons } from '../../lessons/auto-migrate.js';
import { deprecateLesson } from '../../lessons/deprecate.js';
import type { LessonStatus } from '../../lessons/graph-schema.js';
import { tryLoadLessonsGraph } from '../../lessons/graph-store.js';
import { capRulePayload, clampText } from '../../lessons/rule-line.js';

export interface LessonsShowInput {
  readonly topic: string;
}

export interface LessonsDeprecateInput {
  readonly id: string;
  readonly superseded_by?: string;
}

export interface LessonsShowResult {
  readonly topic: string;
  readonly summary: string;
  readonly lessons: Array<{
    id: string;
    rule: string;
    status: LessonStatus;
    topics: string[];
    triggers: string[];
    evidence: string[];
  }>;
  /** Lessons cut by the payload cap. */
  readonly omitted?: number;
}

/**
 * Inspect a topic: its summary and every lesson under it (all statuses). Rules
 * are clamped and their total text capped, since the graph may come from a
 * cloned repo.
 */
export async function lessonsShow(
  ctx: McpContext,
  input: LessonsShowInput,
): Promise<LessonsShowResult> {
  await maybeAutoMigrateLessons(ctx.projectRoot);
  const graph = tryLoadLessonsGraph(ctx.projectRoot);
  const topic = graph?.topics[input.topic];
  if (graph === null || topic === undefined) {
    throw new McpError('NOT_FOUND', `lessons_show: unknown topic "${input.topic}".`);
  }
  const lessons = Object.entries(graph.lessons)
    .filter(([, l]) => l.topics.includes(input.topic))
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([id, l]) => ({
      id,
      rule: clampText(l.rule),
      status: l.status,
      topics: [...l.topics],
      triggers: [...l.triggers],
      evidence: [...l.evidence],
    }));
  const { kept, dropped } = capRulePayload(lessons, (l) => l.rule.length);
  return {
    topic: input.topic,
    summary: clampText(topic.summary),
    lessons: kept,
    ...(dropped > 0 ? { omitted: dropped } : {}),
  };
}

/** Retire a lesson (deprecated, or superseded when `superseded_by` is given). */
export async function lessonsDeprecate(
  ctx: McpContext,
  input: LessonsDeprecateInput,
): Promise<{ id: string; status: LessonStatus; supersededBy: string | null }> {
  try {
    return await deprecateLesson(ctx.projectRoot, input.id, input.superseded_by ?? null);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A missing lesson or superseder is a NOT_FOUND referent failure — map it so
    // the client does not see the IO_ERROR catch-all. Any other failure (a real
    // IO error from the transactional write) falls through to that catch-all and
    // stays IO_ERROR, so genuine filesystem problems keep their correct code.
    if (/^Unknown lesson:|^Unknown superseder:/.test(message)) {
      throw new McpError('NOT_FOUND', `lessons_deprecate: ${message}`);
    }
    throw err;
  }
}
