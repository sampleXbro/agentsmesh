import { UnknownTopicError, type RebasedGlobWarning } from '../../lessons/add.js';
import { captureLesson } from '../../lessons/capture.js';
import { isCaptureRejection } from '../../lessons/capture-rejection.js';
import { deprecateLesson } from '../../lessons/deprecate.js';
import { LessonsWriteRefusedError } from '../../lessons/mutate.js';
import { lessonsActivated } from '../../lessons/paths.js';
import {
  errorResult,
  listFlag,
  repeatedFlag,
  stringFlag,
  type LessonsFlags,
} from './lessons-helpers.js';
import { withErrorCode } from './lessons-error-code.js';
import { anchorTriggerGlob } from './lessons-trigger-glob.js';
import { lessonsAddHint } from './lessons-usage.js';
import type { LessonsAddData, LessonsCommandResult } from './lessons-types.js';

export function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** A write the validator refused is bad input (2); any other failure is 1. */
export function errExitCode(err: unknown): 1 | 2 {
  return err instanceof LessonsWriteRefusedError ? 2 : 1;
}

/** The globs as saved, plus a note for each one that moved off the typed text. */
function anchorTriggerFiles(
  globs: readonly string[],
  projectRoot: string,
  cwd: string | undefined,
): { files: string[]; notes: RebasedGlobWarning[] } {
  const files: string[] = [];
  const notes: RebasedGlobWarning[] = [];
  for (const glob of globs) {
    const anchored = cwd === undefined ? glob : anchorTriggerGlob(glob, projectRoot, cwd);
    files.push(anchored);
    if (anchored !== glob) {
      notes.push({
        code: 'TRIGGER_GLOB_REBASED',
        message: `trigger glob ${JSON.stringify(glob)} rebased to ${anchored} (relative to the current folder)`,
      });
    }
  }
  return { files, notes };
}

/** `cwd` is the folder the command ran in; below the project root it anchors `--trigger-file`. */
export async function doAdd(
  flags: LessonsFlags,
  positionalRule: string | undefined,
  projectRoot: string,
  cwd?: string,
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

  if (scopeFlag !== undefined && scopeFlag !== 'always') {
    const error = `--scope must be "always" (got ${JSON.stringify(scopeFlag)}).${lessonsAddHint()}`;
    return errorResult('add', error, 2);
  }
  const { files, notes } = anchorTriggerFiles(
    repeatedFlag(flags, 'trigger-file'),
    projectRoot,
    cwd,
  );
  try {
    // Route through captureLesson (not addLesson directly) so capture telemetry
    // records EVERY shell-driven add — the MCP path already routes here, and a
    // direct addLesson call would leave CLI captures invisible to `lessons stats`.
    const result = await captureLesson(
      projectRoot,
      {
        rule,
        topic,
        triggers: {
          files,
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
    const data: LessonsAddData = {
      ...result,
      warnings: [...result.warnings, ...notes],
      ...(activationNote ? { activationNote } : {}),
    };
    return { subcommand: 'add', exitCode: 0, data };
  } catch (err) {
    if (err instanceof UnknownTopicError) {
      const message = `Unknown topic: ${err.topic}. Pass --new-topic --topic-summary "..." to create it.`;
      return withErrorCode(errorResult('add', message, 1), err);
    }
    if (isCaptureRejection(err)) {
      return withErrorCode(errorResult('add', `${err.message}${lessonsAddHint()}`, 2), err);
    }
    return withErrorCode(errorResult('add', errMessage(err), errExitCode(err)), err);
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
    return withErrorCode(errorResult('deprecate', `${message}${hint}`, errExitCode(err)), err);
  }
}
