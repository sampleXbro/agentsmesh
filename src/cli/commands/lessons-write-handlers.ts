import { UnknownTopicError } from '../../lessons/add.js';
import { captureLesson } from '../../lessons/capture.js';
import { isCaptureRejection } from '../../lessons/capture-rejection.js';
import { deprecateLesson } from '../../lessons/deprecate.js';
import { lessonsActivated } from '../../lessons/paths.js';
import {
  errorResult,
  listFlag,
  repeatedFlag,
  stringFlag,
  type LessonsFlags,
} from './lessons-helpers.js';
import { lessonsAddHint } from './lessons-usage.js';
import type { LessonsAddData, LessonsCommandResult } from './lessons-types.js';

/**
 * Strip internal function-name prefixes (the transactional write path tags its
 * errors) so the agent sees a clean, actionable message.
 */
export function errMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/^(mutateLessonsGraph|mergeLessons):\s*/, '');
}

export async function doAdd(
  flags: LessonsFlags,
  positionalRule: string | undefined,
  projectRoot: string,
): Promise<LessonsCommandResult> {
  // The BLOCKING ritual in CLAUDE.md / README documents `add "<rule>" --topic`,
  // so accept the rule positionally; an explicit --rule flag takes precedence.
  const positional =
    positionalRule !== undefined && positionalRule.length > 0 ? positionalRule : null;
  const rule = stringFlag(flags, 'rule') ?? positional;
  const topic = stringFlag(flags, 'topic');
  if (rule === null) {
    return errorResult(
      'add',
      `Missing rule — pass it positionally (\`add "<rule>"\`) or via --rule.${lessonsAddHint()}`,
      2,
    );
  }
  if (topic === null) {
    return errorResult(
      'add',
      `Missing --topic — every lesson needs a topic id (run \`agentsmesh lessons topics\` to list them, or pass --new-topic --topic-summary "..." for a new area).${lessonsAddHint()}`,
      2,
    );
  }

  // When lessons was never activated (no `init --lessons`), a bare `add` writes
  // only the graph — no recall hook, ritual, or skill — so the capture lands but
  // no agent is ever told to recall it. Warn so the half-wired state isn't silent.
  const activationNote = lessonsActivated(projectRoot)
    ? undefined
    : 'Captured — but recall is not wired into your AI tools yet (no `init --lessons`). Run `agentsmesh init --lessons`, then `agentsmesh generate`, so agents recall this automatically.';

  // `--scope always` captures a universal always-on lesson (no trigger needed).
  const scopeFlag = stringFlag(flags, 'scope') ?? undefined;

  try {
    // Any other --scope value is a mistake worth surfacing (caught below → exit 1).
    if (scopeFlag !== undefined && scopeFlag !== 'always') {
      throw new Error(`lessons add: --scope must be "always" (got "${scopeFlag}").`);
    }
    // Route through captureLesson (not addLesson directly) so capture telemetry
    // records EVERY shell-driven add — the MCP path already routes here, and a
    // direct addLesson call would leave CLI captures invisible to `lessons stats`.
    const result = await captureLesson(
      projectRoot,
      {
        rule,
        topic,
        triggers: {
          files: repeatedFlag(flags, 'trigger-file'),
          commands: repeatedFlag(flags, 'trigger-cmd'),
          keywords: repeatedFlag(flags, 'trigger-kw'),
        },
        evidence: listFlag(flags, 'evidence'),
        rationale: stringFlag(flags, 'rationale') ?? undefined,
        ...(scopeFlag === 'always' ? { scope: 'always' as const } : {}),
      },
      {
        allowNewTopic: flags['new-topic'] === true,
        topicSummary: stringFlag(flags, 'topic-summary') ?? undefined,
      },
    );
    const data: LessonsAddData = { ...result, ...(activationNote ? { activationNote } : {}) };
    return { subcommand: 'add', exitCode: 0, data };
  } catch (err) {
    if (err instanceof UnknownTopicError) {
      return errorResult(
        'add',
        `Unknown topic: ${err.topic}. Pass --new-topic --topic-summary "..." to create it.`,
        1,
      );
    }
    if (isCaptureRejection(err)) {
      return errorResult('add', `${err.message}${lessonsAddHint()}`, 2);
    }
    return errorResult('add', errMessage(err), 1);
  }
}

export async function doDeprecate(
  flags: LessonsFlags,
  lessonId: string | undefined,
  projectRoot: string,
): Promise<LessonsCommandResult> {
  if (lessonId === undefined || lessonId === '') {
    return errorResult(
      'deprecate',
      'Usage: agentsmesh lessons deprecate <id> [--superseded-by <id>]',
      2,
    );
  }
  const supersededBy = stringFlag(flags, 'superseded-by');
  try {
    const { id, supersededBy: by } = await deprecateLesson(projectRoot, lessonId, supersededBy);
    return { subcommand: 'deprecate', exitCode: 0, data: { id, supersededBy: by } };
  } catch (err) {
    const message = errMessage(err);
    // Point an unknown-id miss at the listing commands instead of dead-ending.
    const hint = message.startsWith('Unknown lesson')
      ? ' Run `agentsmesh lessons journal` to list lesson ids (or `lessons query --ids` to see what recalled).'
      : '';
    return errorResult('deprecate', `${message}${hint}`, 1);
  }
}
