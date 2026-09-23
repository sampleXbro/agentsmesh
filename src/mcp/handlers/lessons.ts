import type { McpContext } from '../context.js';
import { UnknownTopicError } from '../../lessons/add.js';
import { maybeAutoMigrateLessons } from '../../lessons/auto-migrate.js';
import { tryLoadLessonsGraph } from '../../lessons/graph-store.js';
import { captureLesson } from '../../lessons/capture.js';
import { isCaptureRejection } from '../../lessons/capture-rejection.js';
import { McpError } from '../errors.js';
import { lessonsDeprecate, lessonsShow } from './lessons-curation.js';
import { lessonsQuery } from './lessons-query.js';

/** A list input the agent may pass as a bare string or an array (CLI parity). */
type ListInput = string | readonly string[] | undefined;

interface LessonsAddInput {
  readonly rule: string;
  readonly topic: string;
  readonly trigger_files?: ListInput;
  /** CLI-flag alias of `trigger_files` (--trigger-file); folded in below. */
  readonly trigger_file?: ListInput;
  readonly trigger_commands?: ListInput;
  /** CLI-flag alias of `trigger_commands` (--trigger-cmd); folded in below. */
  readonly trigger_cmd?: ListInput;
  readonly trigger_keywords?: ListInput;
  /** CLI-flag alias of `trigger_keywords` (--trigger-kw); folded in below. */
  readonly trigger_kw?: ListInput;
  readonly evidence?: ListInput;
  readonly rationale?: string;
  readonly new_topic?: boolean;
  readonly topic_summary?: string;
  /** `'always'` = a universal always-on lesson (no trigger needed). */
  readonly scope?: string;
}

/**
 * Trigger parity with the CLI `repeatedFlag`: a scalar becomes a single value and
 * commas are NEVER split — globs (`src/{a,b}/**`) and regexes (`^a{1,3}$`)
 * legitimately contain commas, so splitting would forge broken triggers.
 */
function toTriggerList(v: ListInput): string[] {
  if (v === undefined) return [];
  if (typeof v === 'string') return v.length > 0 ? [v] : [];
  return v.filter((s) => s.length > 0);
}

/**
 * Evidence parity with the CLI `listFlag`: arrays pass through; a scalar is
 * comma-split (evidence refs like `commit:SHA` / `lesson:id` never contain commas).
 */
function toEvidenceList(v: ListInput): string[] {
  if (v === undefined) return [];
  if (typeof v === 'string') {
    return v
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return v.filter((s) => s.length > 0);
}

export const lessonsHandlers = {
  query: lessonsQuery,

  async topics(ctx: McpContext): Promise<{ topics: Array<{ id: string; summary: string }> }> {
    await maybeAutoMigrateLessons(ctx.projectRoot);
    const graph = tryLoadLessonsGraph(ctx.projectRoot);
    if (graph === null) return { topics: [] };
    return {
      topics: Object.entries(graph.topics)
        .map(([id, t]) => ({ id, summary: t.summary }))
        .sort((a, b) => (a.id < b.id ? -1 : 1)),
    };
  },

  show: lessonsShow,

  deprecate: lessonsDeprecate,

  async add(
    ctx: McpContext,
    input: LessonsAddInput,
  ): Promise<{
    id: string;
    isNewLesson: boolean;
    isNewTopic: boolean;
    newTriggerIds: string[];
    warnings: Array<{ code: string; message: string }>;
    autoPruned?: { removedTriggers: number; removedTopics: number; detachedDeadGlobs: number };
  }> {
    if (input.scope !== undefined && input.scope !== 'always') {
      throw new McpError(
        'VALIDATION_FAILED',
        `lessons_add: scope must be "always" (got "${input.scope}").`,
      );
    }
    // captureLesson migrates any legacy store first so capture enriches the real
    // graph instead of creating lessons.json and stranding the legacy lessons.
    try {
      return await captureLesson(
        ctx.projectRoot,
        {
          rule: input.rule,
          topic: input.topic,
          // Fold the CLI-flag aliases (singular) into the canonical plural field;
          // the canonical field wins when both are present (parity with query's
          // `command ?? cmd`). Each value is coerced from string-or-array.
          triggers: {
            files: toTriggerList(input.trigger_files ?? input.trigger_file),
            commands: toTriggerList(input.trigger_commands ?? input.trigger_cmd),
            keywords: toTriggerList(input.trigger_keywords ?? input.trigger_kw),
          },
          evidence: toEvidenceList(input.evidence),
          rationale: input.rationale,
          ...(input.scope === 'always' ? { scope: 'always' as const } : {}),
        },
        {
          allowNewTopic: input.new_topic === true,
          topicSummary: input.topic_summary,
        },
      );
    } catch (err) {
      // Unknown topic is a missing-referent failure → NOT_FOUND. The other
      // guardrails (empty/oversized rule, no trigger, unrecallable, broad command
      // pattern, file trigger outside the project) are capture rejections →
      // VALIDATION_FAILED. In both cases surface the domain
      // machine code in `details.code` so clients keep the precise reason.
      if (err instanceof UnknownTopicError) {
        throw new McpError(
          'NOT_FOUND',
          `lessons_add: unknown topic "${err.topic}". Pass new_topic=true + topic_summary to create it.`,
          { code: err.code },
        );
      }
      if (isCaptureRejection(err)) {
        throw new McpError('VALIDATION_FAILED', `lessons_add: ${err.message}`, { code: err.code });
      }
      throw err;
    }
  },
};
