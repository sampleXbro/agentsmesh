import { z } from 'zod';
import { lessonsHandlers } from '../handlers/lessons.js';
import type { ToolDescriptor } from './types.js';

const LessonsQueryInput = z
  .object({
    file: z.string().optional().describe('Project-relative path of the file about to be edited.'),
    command: z
      .string()
      .optional()
      .describe('Shell command about to be executed (CLI flag: --cmd).'),
    cmd: z
      .string()
      .optional()
      .describe('Alias of `command` (matches the CLI `--cmd` flag). Use `command` if unsure.'),
    keyword: z.string().optional().describe('Free-form description of the active task.'),
    limit: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Max ranked lessons to return (default 10). Results are relevance-ranked.'),
    max_tokens: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Cap results by cumulative estimated rule-token cost (CLI flag: --max-tokens).'),
    'max-tokens': z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Alias of `max_tokens` (matches the CLI `--max-tokens` flag).'),
    verbose: z
      .boolean()
      .optional()
      .describe('Include topics/triggers/evidence/score. Default false (compact: id + rule only).'),
    always: z
      .boolean()
      .optional()
      .describe(
        'Include the UNIVERSAL always-on lessons (standards that apply to every task, e.g. comment/test conventions) — they are excluded from triggered recall and delivered here. Set true at task start; no predicate is required when `always` is the only field.',
      ),
    session: z
      .string()
      .optional()
      .describe(
        'Session correlator for dedup. Omitted or "auto" = AGENTSMESH_SESSION_ID when exported, else this MCP server process — so repeats within one client session are suppressed by default. Pass an explicit id to control the scope.',
      ),
    no_dedup: z
      .boolean()
      .optional()
      .describe(
        'Disable session dedup for this call — return the full ranked set including lessons already delivered this session (e.g. after the client compacted its context).',
      ),
    'no-dedup': z
      .boolean()
      .optional()
      .describe('Alias of `no_dedup` (matches the CLI `--no-dedup` flag).'),
  })
  .strict();

// List fields accept a bare string OR an array — the handler coerces a scalar to
// a single value, matching the CLI's tolerance (a string is the common mistake).
const stringOrStringArray = z.union([z.string(), z.array(z.string())]);

const LessonsAddInput = z
  .object({
    rule: z.string().min(1).describe('Imperative rule that prevents recurrence.'),
    topic: z.string().min(1).describe('Topic id. Use new_topic + topic_summary to create one.'),
    trigger_files: stringOrStringArray
      .optional()
      .describe('file_glob triggers (e.g. ["src/cli/**/*.ts"] or a single "src/**").'),
    trigger_file: stringOrStringArray
      .optional()
      .describe('Alias of `trigger_files` (matches the CLI `--trigger-file` flag).'),
    trigger_commands: stringOrStringArray
      .optional()
      .describe('command_pattern triggers — regexes matched against shell commands.'),
    trigger_cmd: stringOrStringArray
      .optional()
      .describe('Alias of `trigger_commands` (matches the CLI `--trigger-cmd` flag).'),
    trigger_keywords: stringOrStringArray
      .optional()
      .describe('keyword triggers — case-insensitive whole-token runs of task descriptions.'),
    trigger_kw: stringOrStringArray
      .optional()
      .describe('Alias of `trigger_keywords` (matches the CLI `--trigger-kw` flag).'),
    evidence: stringOrStringArray
      .optional()
      .describe('Evidence references (commit:SHA, lesson:id, …). A scalar may be comma-separated.'),
    rationale: z.string().optional().describe('Optional one-line "why" behind the rule.'),
    new_topic: z.boolean().optional().describe('Allow creating a new topic if missing.'),
    topic_summary: z
      .string()
      .optional()
      .describe('Required when new_topic creates a topic. One-line summary.'),
    scope: z
      .literal('always')
      .optional()
      .describe(
        'Set "always" for a UNIVERSAL always-on lesson (a standard that applies to every task, e.g. a comment/test convention) — it needs no trigger and is delivered on every task instead of matched. Omit for a normal triggered lesson.',
      ),
  })
  .strict();

export const LESSONS_TOOL_DESCRIPTORS: ToolDescriptor[] = [
  {
    name: 'lessons_query',
    description:
      'Recall primitive — return active lessons whose triggers match the supplied (file, command, keyword) predicates, relevance-ranked (trigger specificity + per-query topic coherence + BM25 over rule text) and capped to `limit` (default 10). Pass at least one predicate OR `always:true` (a call with neither is rejected); always include `file` for an edit and `command` for a shell command — keyword-only recall misses file/command-scoped lessons. `always:true` additionally prepends the universal always-on lessons. Session dedup is ON by default (correlator: AGENTSMESH_SESSION_ID, else this server process): a lesson already delivered this session is suppressed and counted in `suppressed` — pass `no_dedup:true` to re-show everything (e.g. after context compaction), or `session` to control the scope. Returns compact `{id, rule}` by default; pass `verbose:true` for topics/triggers/evidence/score. Excludes deprecated and superseded lessons.',
    inputSchema: LessonsQueryInput,
    projectOptional: true,
    handler: (ctx, i) => lessonsHandlers.query(ctx, i as never),
  },
  {
    name: 'lessons_add',
    description:
      'Capture primitive — atomically add a new lesson. At least one EFFECTIVE trigger is REQUIRED — the add is rejected (UNRECALLABLE_LESSON, exit 2) when every trigger is dead on the mandatory file/command recall path (a stopword-only keyword whose needle loses all tokens to stopword filtering, or an invalid/ReDoS command regex). A lesson with a mix of live and dead triggers is NOT rejected. Prefer a precise `trigger_files` glob, the most reliable trigger. Deduplicates triggers against the graph. Idempotent on repeat (same rule + topic → same id, no duplicate triggers). Returns non-blocking `warnings` (trigger-hygiene nudges: oversized trigger set, broad globs, keyword-only, glob whose file git history renamed or deleted [DEAD_GLOB], glob whose file does not exist yet [PENDING_GLOB], or rule closely paraphrasing an existing active lesson [NEAR_DUPLICATE_LESSON]) — heed them by preferring a few specific triggers.',
    inputSchema: LessonsAddInput,
    projectOptional: true,
    handler: (ctx, i) => lessonsHandlers.add(ctx, i as never),
  },
  {
    name: 'lessons_topics',
    description:
      'List every topic id and summary — call before lessons_add to choose a valid --topic instead of guessing (which would create an unintended new topic).',
    inputSchema: z.object({}).strict(),
    projectOptional: true,
    handler: (ctx) => lessonsHandlers.topics(ctx),
  },
  {
    name: 'lessons_show',
    description:
      'Inspect a topic — return its summary and its lessons (id, rule, status, triggers, evidence), including deprecated/superseded ones. Rule text is size-capped; `omitted` counts lessons cut from a very large topic. Use to find the id of a stale lesson before lessons_deprecate.',
    inputSchema: z
      .object({ topic: z.string().min(1).describe('Topic id to inspect (see lessons_topics).') })
      .strict(),
    projectOptional: true,
    handler: (ctx, i) => lessonsHandlers.show(ctx, i as never),
  },
  {
    name: 'lessons_deprecate',
    description:
      'Curation primitive — retire a lesson so recall stops returning it. With `superseded_by` the lesson is marked superseded by that replacement; without it the lesson is plainly deprecated. Throws on an unknown lesson or superseder.',
    inputSchema: z
      .object({
        id: z.string().min(1).describe('Lesson id to retire (see lessons_show).'),
        superseded_by: z
          .string()
          .min(1)
          .optional()
          .describe('Replacement lesson id; omit for a plain deprecation.'),
      })
      .strict(),
    projectOptional: true,
    handler: (ctx, i) => lessonsHandlers.deprecate(ctx, i as never),
  },
];
