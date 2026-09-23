import type { McpContext } from '../context.js';
import { lessonsGraphProblem } from '../../lessons/graph-problem.js';
import { recallLessons } from '../../lessons/recall.js';
import { recallAlwaysLessons } from '../../lessons/recall-always.js';
import { loadRecallConfig } from '../../lessons/recall-config.js';
import { clampText, MAX_RECALL_PAYLOAD_CHARS } from '../../lessons/rule-line.js';
import { AUTO_SESSION_TTL_MS } from '../../lessons/seen-cache.js';
import { sessionId as envSessionId } from '../../lessons/telemetry.js';
import { McpError } from '../errors.js';

/**
 * `lessons_query` handler, split from lessons.ts for the 200-line limit.
 *
 * Session dedup is ON by default here: unlike the CLI (a fresh process per
 * call, no ambient correlator), the MCP server process is stable for the whole
 * client session, so its pid is a natural session id. Field telemetry showed
 * correlator-less recall re-delivers the majority of rule-tokens as intra-
 * session repeats; defaulting dedup on removes that noise. `session` overrides
 * the correlator ("auto" = the default resolution), `no_dedup:true` disables.
 * Honest limit: the server cannot see the client compact its context, so a
 * suppressed lesson stays hidden for the server's lifetime — `no_dedup` is the
 * escape hatch, and a server restart naturally resets the set.
 */

export interface LessonsQueryInput {
  readonly file?: string;
  readonly command?: string;
  /** CLI-flag alias of `command` (--cmd); folded into `command` below. */
  readonly cmd?: string;
  readonly keyword?: string;
  readonly limit?: number;
  readonly max_tokens?: number;
  /** CLI-flag alias of `max_tokens` (--max-tokens); folded in below. */
  readonly 'max-tokens'?: number;
  readonly verbose?: boolean;
  /** Include the universal always-on lessons (no predicate required). */
  readonly always?: boolean;
  /** Session correlator for dedup; "auto" (or omitted) = env id, else this server process. */
  readonly session?: string;
  readonly no_dedup?: boolean;
  /** CLI-flag alias of `no_dedup` (--no-dedup); folded in below. */
  readonly 'no-dedup'?: boolean;
}

/**
 * Once-per-process nonce: pids recycle (Linux pid_max 32768) and the seen file
 * outlives the process in the OS temp dir, so a bare `mcp-<pid>` could resurrect
 * a dead session's suppressions onto a brand-new server. The nonce makes the
 * correlator truly per-lifetime, so a restart really does reset the set.
 */
const INSTANCE_NONCE = Date.now().toString(36);

/** Default correlator: exported env id when present, else this server process lifetime. */
export function mcpSessionId(): string {
  return envSessionId() ?? `mcp-${process.pid}-${INSTANCE_NONCE}`;
}

export interface LessonsQueryOutput {
  lessons: Array<{
    id: string;
    rule: string;
    topics?: string[];
    triggers?: string[];
    evidence?: string[];
    score?: number;
  }>;
  totalMatches: number;
  /** Matches hidden by session dedup (already delivered this session). */
  suppressed?: number;
}

/** Recall's token estimate (see ranking.ts estTokens). */
const CHARS_PER_TOKEN = 4;

/**
 * The recall token budget, lowered so the answer's rules fit the payload cap.
 * Capping inside recall, not after it, keeps dedup marking only what is sent.
 */
function payloadBoundedTokens(requested: number, already: ReadonlyArray<{ rule: string }>): number {
  const used = already.reduce((n, l) => n + l.rule.length, 0);
  const room = Math.floor((MAX_RECALL_PAYLOAD_CHARS - used) / CHARS_PER_TOKEN);
  return Math.min(requested, Math.max(0, room));
}

export async function lessonsQuery(
  ctx: McpContext,
  input: LessonsQueryInput,
): Promise<LessonsQueryOutput> {
  // Migration-aware recall; applies the default token budget when the caller
  // omits max_tokens so mandatory recall stays token-lean. Fold the CLI-flag
  // aliases (`cmd`, `max-tokens`, `no-dedup`) into their canonical fields so
  // agents coming from the CLI docs are not tripped by the name difference.
  const query = {
    file: input.file,
    command: input.command ?? input.cmd,
    keyword: input.keyword,
  };
  if (
    input.always !== true &&
    query.file === undefined &&
    query.command === undefined &&
    query.keyword === undefined
  ) {
    throw new McpError(
      'VALIDATION_FAILED',
      'lessons_query: provide at least one of file, command, keyword, or always=true to recall against.',
    );
  }
  if (query.keyword !== undefined && query.file === undefined && query.command === undefined) {
    process.stderr.write(
      'agentsmesh: keyword-only recall misses file_glob/command_pattern lessons — ' +
        'pass file and/or command for complete recall.\n',
    );
  }
  // `always=true` prepends the universal always-on lessons (excluded from
  // triggered recall) so a non-hook agent can pull them at task start.
  const alwaysOut =
    input.always === true
      ? (
          await recallAlwaysLessons(ctx.projectRoot, {
            // Same correlator and same bound as the triggered path below:
            // otherwise an exported AGENTSMESH_SESSION_ID would suppress the
            // universal lessons here with no TTL and no reset signal at all.
            sessionId: mcpSessionId(),
            ttlMs: AUTO_SESSION_TTL_MS,
          })
        ).lessons.map(({ id, rule }) => ({ id, rule: clampText(rule) }))
      : [];
  const {
    lessons: ranked,
    totalMatches,
    suppressed,
    corrupt,
    newerVersion,
  } = await recallLessons(ctx.projectRoot, query, {
    limit: input.limit,
    maxTokens: payloadBoundedTokens(
      input.max_tokens ?? input['max-tokens'] ?? loadRecallConfig(ctx.projectRoot).maxTokens,
      alwaysOut,
    ),
    sessionId:
      input.session === undefined || input.session === 'auto' ? mcpSessionId() : input.session,
    noDedup: input.no_dedup === true || input['no-dedup'] === true,
    // The server never sees the client compact its context, so suppression is
    // BOUNDED here: without it, a rule the client summarized away would stay
    // hidden for the whole server lifetime — a blocking recall gate silently
    // returning nothing. `no_dedup` is still the immediate escape.
    ttlMs: AUTO_SESSION_TTL_MS,
  });
  if (corrupt === true || newerVersion !== undefined) {
    // Recall degrades to empty rather than throwing; the reason goes to stderr
    // (stdout is the MCP protocol channel), worded like the CLI's warning.
    const problem = lessonsGraphProblem(ctx.projectRoot);
    if (problem !== null) {
      process.stderr.write(`agentsmesh: recall returned no lessons: ${problem.message}\n`);
    }
  }
  // Compact by default — return only id + rule to keep recall token-cheap.
  // Metadata (topics/triggers/evidence/score) is opt-in via `verbose`.
  const verbose = input.verbose === true;
  return {
    lessons: [
      ...alwaysOut,
      ...ranked.map(({ id, lesson, score }) =>
        verbose
          ? {
              id,
              rule: clampText(lesson.rule),
              topics: [...lesson.topics],
              triggers: [...lesson.triggers],
              evidence: [...lesson.evidence],
              score,
            }
          : { id, rule: clampText(lesson.rule) },
      ),
    ],
    totalMatches,
    ...(suppressed > 0 ? { suppressed } : {}),
  };
}
