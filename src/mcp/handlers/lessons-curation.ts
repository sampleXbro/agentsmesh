import { lessonsRootOf, type McpContext } from '../context.js';
import { McpError } from '../errors.js';
import { maybeAutoMigrateLessons } from '../../lessons/auto-migrate.js';
import { deprecateLesson } from '../../lessons/deprecate.js';
import type { Lesson, LessonsGraph, LessonStatus } from '../../lessons/graph-schema.js';
import { capRulePayload, clampText } from '../../lessons/rule-line.js';
import { readableGraph, writableLessonsRoot, writeRefusalError } from './lessons-guards.js';

export interface LessonsShowInput {
  /** A topic id, or a lesson id when no topic has that id (CLI `show` parity). */
  readonly topic: string;
}

export interface LessonsDeprecateInput {
  readonly id: string;
  readonly superseded_by?: string;
}

export interface LessonsShowEntry {
  readonly id: string;
  readonly rule: string;
  readonly status: LessonStatus;
  readonly topics: string[];
  readonly triggers: string[];
  readonly evidence: string[];
  readonly supersededBy?: string;
}

export interface LessonsShowTopicResult {
  readonly topic: string;
  readonly summary: string;
  readonly lessons: LessonsShowEntry[];
  /** Lessons cut by the payload cap; each stays reachable by its id. */
  readonly omitted?: number;
}

export interface LessonsShowLessonResult {
  readonly lesson: LessonsShowEntry;
}

export type LessonsShowResult = LessonsShowTopicResult | LessonsShowLessonResult;

function showEntry(id: string, l: Lesson): LessonsShowEntry {
  return {
    id,
    rule: clampText(l.rule),
    status: l.status,
    topics: [...l.topics],
    triggers: [...l.triggers],
    evidence: [...l.evidence],
    ...(l.supersededBy === undefined ? {} : { supersededBy: l.supersededBy }),
  };
}

/**
 * Inspect a topic — its summary and every lesson under it (all statuses) — or,
 * when no topic has the id, the one lesson with that id. Rules are clamped and
 * their total text capped, since the graph may come from a cloned repo.
 */
export async function lessonsShow(
  ctx: McpContext,
  input: LessonsShowInput,
): Promise<LessonsShowResult> {
  const root = lessonsRootOf(ctx);
  const graph = root === null ? null : await loadReadable(root);
  const subject = input.topic;
  const topic = graph?.topics[subject];
  if (graph !== null && topic !== undefined) {
    const lessons = Object.entries(graph.lessons)
      .filter(([, l]) => l.topics.includes(subject))
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([id, l]) => showEntry(id, l));
    const { kept, dropped } = capRulePayload(lessons, (l) => l.rule.length);
    return {
      topic: subject,
      summary: clampText(topic.summary),
      lessons: kept,
      ...(dropped > 0 ? { omitted: dropped } : {}),
    };
  }
  const lesson = graph?.lessons[subject];
  if (lesson !== undefined) return { lesson: showEntry(subject, lesson) };
  throw new McpError('NOT_FOUND', `lessons_show: unknown topic or lesson id "${subject}".`);
}

async function loadReadable(root: string): Promise<LessonsGraph | null> {
  await maybeAutoMigrateLessons(root);
  return readableGraph(root);
}

/** Retire a lesson (deprecated, or superseded when `superseded_by` is given). */
export async function lessonsDeprecate(
  ctx: McpContext,
  input: LessonsDeprecateInput,
): Promise<{ id: string; status: LessonStatus; supersededBy: string | null }> {
  const root = writableLessonsRoot(ctx, 'lessons_deprecate');
  readableGraph(root); // an unreadable graph fails here, before any write
  try {
    return await deprecateLesson(root, input.id, input.superseded_by ?? null);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A missing lesson or superseder is a NOT_FOUND referent failure, and a
    // change the graph validator refuses is VALIDATION_FAILED. Anything else (a
    // real IO error from the transactional write) keeps the IO_ERROR catch-all.
    if (/^Unknown lesson:|^Unknown superseder:/.test(message)) {
      throw new McpError('NOT_FOUND', `lessons_deprecate: ${message}`);
    }
    throw writeRefusalError('lessons_deprecate', err) ?? err;
  }
}
