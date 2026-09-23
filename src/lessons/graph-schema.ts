import { z } from 'zod';

/**
 * Schema version this build WRITES. A graph stamped higher is from a newer CLI.
 * v2 adds the optional lesson `scope: 'always'` (always-on lessons). Reads accept
 * v1 (legacy) and v2 — see {@link VersionSchema}; every write stamps this value, so
 * a v1 graph upgrades to v2 on first mutation. An older CLI reading a v2 graph
 * reports `newer-version` (graph-store) and degrades gracefully rather than
 * choking on the unknown `scope` key under its strict v1 schema.
 */
export const CURRENT_GRAPH_VERSION = 2;

/** Versions this build can READ (accepts legacy v1 and current v2). */
const VersionSchema = z.union([z.literal(1), z.literal(2)]);

/**
 * Upper bound on a lesson rule's length, in characters. A rule is one imperative
 * sentence; this is generous headroom. Enforced as a BLOCK at capture (a longer
 * rule is a capture defect) and as a defensive TRUNCATION at hook emission, so a
 * cloned-repo graph with a megabyte-scale rule cannot flood an agent's context.
 * It is deliberately NOT a schema `.max()`: that would mark such a graph
 * "corrupt" and disable ALL recall — a worse outcome than truncating one rule.
 */
export const MAX_RULE_LENGTH = 2000;

const IdSchema = z.string().regex(/^[a-z0-9-]+$/, 'id must be kebab-case');
const DateSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z?)?$/,
    'createdAt must be ISO-8601 date or datetime',
  );

const TopicSchema = z
  .object({
    summary: z.string().min(1, 'topic summary must not be empty'),
  })
  .strict();

const TriggerKindSchema = z.enum(['file_glob', 'command_pattern', 'keyword']);

const TriggerSchema = z
  .object({
    kind: TriggerKindSchema,
    pattern: z.string().min(1, 'trigger pattern must not be empty'),
  })
  .strict();

const LessonStatusSchema = z.enum(['active', 'deprecated', 'superseded']);

const LessonSchema = z
  .object({
    rule: z.string().min(1, 'lesson rule must not be empty'),
    rationale: z.string().min(1).optional(),
    topics: z.array(IdSchema).min(1, 'lesson must reference at least one topic'),
    triggers: z.array(IdSchema),
    evidence: z.array(z.string().min(1)),
    status: LessonStatusSchema,
    supersededBy: IdSchema.optional(),
    createdAt: DateSchema,
    /**
     * `'always'` marks an ALWAYS-ON lesson: a universal standard delivered on
     * every task (via the UserPromptSubmit hook / a `--always` recall) rather than
     * matched by triggers. Such a lesson needs no trigger and is excluded from
     * triggered recall. Absent = a normal triggered lesson.
     */
    scope: z.literal('always').optional(),
  })
  .strict();

export const LessonsGraphSchema = z
  .object({
    version: VersionSchema,
    lessons: z.record(IdSchema, LessonSchema),
    topics: z.record(IdSchema, TopicSchema),
    triggers: z.record(IdSchema, TriggerSchema),
  })
  .strict();

export type LessonsGraph = z.infer<typeof LessonsGraphSchema>;
export type Lesson = z.infer<typeof LessonSchema>;
export type Topic = z.infer<typeof TopicSchema>;
export type Trigger = z.infer<typeof TriggerSchema>;
export type TriggerKind = z.infer<typeof TriggerKindSchema>;
export type LessonStatus = z.infer<typeof LessonStatusSchema>;

export function parseGraph(raw: unknown): LessonsGraph {
  return LessonsGraphSchema.parse(raw);
}

/** A graph with no lessons, topics or triggers, at the current schema version. */
export function emptyGraph(): LessonsGraph {
  return { version: CURRENT_GRAPH_VERSION, lessons: {}, topics: {}, triggers: {} };
}
