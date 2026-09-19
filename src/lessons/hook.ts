import { buildCaptureNudge, RECURRENCE_THRESHOLD } from './capture-nudge.js';
import { hookCommandFastpath } from './cmd-fastpath.js';
import { contextKey } from './context-key.js';
import { diffTerms } from './diff-terms.js';
import { errorClass } from './error-class.js';
import { failureText } from './failure-text.js';
import {
  contextOutput,
  emitRecall,
  EMPTY,
  formatInjection,
  type RecallHookResult,
} from './hook-emit.js';
import { failuresForContext, recordFailure } from './outcome-log.js';
import type { LessonsQuery } from './query.js';
import { recallAlwaysLessons } from './recall-always.js';
import { recallLessons } from './recall.js';
import { hasCoveringLesson, recurrenceEscalation } from './recurrence-gate.js';
import { clearSeenForSessionStart } from './seen-cache.js';

/**
 * Hook-mode recall: the runtime engine behind a generated tool-call hook.
 *
 * A prose contract asks the agent to RUN recall before every mutating action —
 * an extra model turn each time, and only as reliable as the agent's compliance.
 * A hook runs recall deterministically and injects the matching lessons into the
 * model's context with zero extra model turn and zero compliance dependence. The
 * command is EVENT-AWARE: it echoes the harness's `hook_event_name`, so the same
 * command serves as a PreToolUse hook that guards the FIRST touch of a file
 * (injecting BEFORE the edit) and/or a PostToolUse hook that covers later actions.
 *
 * Only some harnesses can inject context from a tool-call hook (Claude Code
 * supports PreToolUse + PostToolUse `additionalContext`; some support only Post).
 * This command is harness-adaptive: it reads the hook's stdin JSON, and on
 * anything it does not recognize — a parse failure, a shape without a
 * file/command, or zero matches — it emits NOTHING. A hook must never break the
 * harness or inject noise, so every failure path is a silent no-op (exit 0).
 */

interface HookStdin {
  readonly session_id?: unknown;
  readonly hook_event_name?: unknown;
  /** SessionStart's origin: `startup` | `resume` | `clear` | `compact`. */
  readonly source?: unknown;
  /** UserPromptSubmit carries the raw task text here (no `tool_input`). */
  readonly prompt?: unknown;
  /** Alternate field name some harnesses use for the submitted prompt. */
  readonly user_message?: unknown;
  /** PostToolUseFailure carries the failure text here (field name varies by harness). */
  readonly tool_error?: unknown;
  readonly tool_response?: unknown;
  readonly tool_input?: {
    readonly file_path?: unknown;
    /** NotebookEdit uses `notebook_path` instead of `file_path`. */
    readonly notebook_path?: unknown;
    readonly command?: unknown;
    /** Diff-aware recall reads the content being written — see diff-terms.ts. */
    readonly new_string?: unknown;
    readonly content?: unknown;
    readonly edits?: unknown;
  } | null;
}

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;

/**
 * Parse a PostToolUse hook stdin payload, recall lessons for the touched file /
 * command / change content, and return the harness's context-injection JSON (or
 * empty output). `session_id` from the harness drives per-session dedup, so a
 * lesson is injected at most once per session even as the agent re-touches a file.
 */
export async function buildRecallHookOutput(
  rawStdin: string,
  projectRoot: string,
): Promise<RecallHookResult> {
  let parsed: HookStdin;
  try {
    parsed = JSON.parse(rawStdin) as HookStdin;
  } catch {
    return EMPTY;
  }
  const sessionId = str(parsed.session_id);

  // SessionStart resets dedup to match what actually happened to the context —
  // compact/clear discarded it, startup began a new chat, resume restored the old
  // one. See clearSeenForSessionStart. No recall content is emitted here; the
  // following UserPromptSubmit/edit re-delivers.
  if (parsed.hook_event_name === 'SessionStart') {
    clearSeenForSessionStart(str(parsed.source), sessionId, projectRoot);
    return EMPTY;
  }

  // UserPromptSubmit is the ONLY event that carries the task text and has no
  // `tool_input`. The tool-call path never sees task intent, so a keyword-only
  // (conceptual/"general") lesson is otherwise unrecallable — its concept must
  // appear as a path/command token to fire. Here we recall it against the prompt
  // itself, the richest conceptual signal. (SessionStart/SubagentStart carry no
  // prompt text — verified vs the hooks docs — so they are NOT a keyword source.)
  if (parsed.hook_event_name === 'UserPromptSubmit') {
    const promptText = str(parsed.prompt) ?? str(parsed.user_message);
    // Always-on lessons ride EVERY prompt (universal standards); keyword recall
    // adds task-specific conceptual lessons from the prompt text. Both session-
    // deduped, so each is injected at most once per session.
    const always = await recallAlwaysLessons(projectRoot, { sessionId });
    const keyword =
      promptText === undefined
        ? []
        : (await recallLessons(projectRoot, { keyword: promptText }, { sessionId })).lessons;
    const rules = [...always.lessons.map((l) => l.rule), ...keyword.map((l) => l.lesson.rule)];
    if (rules.length === 0) return EMPTY;
    return formatInjection('UserPromptSubmit', 'Recalled agentsmesh lessons for this task', rules);
  }

  // NotebookEdit matches the `Edit` matcher but carries `notebook_path`, not
  // `file_path` — read both so a notebook edit recalls its file_glob lessons.
  const file = str(parsed.tool_input?.file_path) ?? str(parsed.tool_input?.notebook_path);
  const command = str(parsed.tool_input?.command);

  // A tool call FAILED — the moment for a capture decision. Claude Code fires a
  // dedicated PostToolUseFailure event; other harnesses instead carry the error TEXT
  // on a normally-named tool-call event, so detect failure by the event name OR a
  // non-empty `tool_error` (portable). This also stops a failed tool-call from being
  // mis-recorded as a successful delivery on a harness that reuses PostToolUse.
  const errorText = failureText(parsed);
  if (parsed.hook_event_name === 'PostToolUseFailure' || errorText !== undefined) {
    // Only a real action (file/command) can be attributed, recorded, and covered. An
    // action-less failure (a failed Read/Grep/MCP call → key 'none') still gets the
    // generic nudge, but is never recorded — it would fabricate cross-action recurrence.
    let failures = 0;
    let lastErrorClass: string | undefined;
    let covered = false;
    if (file !== undefined || command !== undefined) {
      const key = contextKey({ file, command }, projectRoot);
      // Record the failure so effectiveness can tell whether a lesson delivered for
      // this same action earlier actually prevented the repeat (EVALUATE).
      recordFailure(
        projectRoot,
        key,
        errorClass(errorText),
        process.env,
        sessionId,
      );
      const history = failuresForContext(projectRoot, key);
      failures = history.count;
      lastErrorClass = history.lastErrorClass;
      // STORE: coverage only changes the nudge once the failure RECURS, so probe the
      // graph (a cheap raw match, no ranker/telemetry) only past the threshold.
      covered = failures >= RECURRENCE_THRESHOLD && hasCoveringLesson(projectRoot, file, command);
    }
    const context = buildCaptureNudge({
      file,
      command,
      sessionId,
      projectRoot,
      failures,
      covered,
      ...(lastErrorClass !== undefined ? { lastErrorClass } : {}),
    });
    return context === null
      ? EMPTY
      : contextOutput(str(parsed.hook_event_name) ?? 'PostToolUseFailure', context);
  }

  if (file === undefined && command === undefined) return EMPTY;

  // Echo the harness's event so the SAME command serves as a PreToolUse first-touch
  // guard (injects BEFORE the edit) or a PostToolUse reactive hook; default to
  // PostToolUse for back-compat and unrecognized events.
  const event = parsed.hook_event_name === 'PreToolUse' ? 'PreToolUse' : 'PostToolUse';

  // Recurrence gate (PreToolUse only): the first-touch guard is the last moment
  // to stop a KNOWN repeat, so a recurring covered action escalates above the
  // regular recall bullets — see recurrence-gate.ts.
  const escalation =
    event === 'PreToolUse' ? recurrenceEscalation(projectRoot, { file, command, sessionId }) : null;

  // Fold the change content into the query so keyword triggers match what is being
  // written, not just the path (diff-aware recall). Empty for non-writing tools.
  const keyword = parsed.tool_input ? diffTerms(parsed.tool_input) : '';
  // Provable command-only no-match: skip the full recall load — see cmd-fastpath.ts.
  if (escalation === null && hookCommandFastpath(projectRoot, { file, command, keyword, sessionId }))
    return EMPTY;
  const query: LessonsQuery = {
    ...(file !== undefined ? { file } : {}),
    ...(command !== undefined ? { command } : {}),
    ...(keyword.length > 0 ? { keyword } : {}),
  };
  const target = file ?? command ?? '';
  return emitRecall(projectRoot, query, {
    event,
    lead: `Recalled agentsmesh lessons for ${target}`,
    sessionId,
    ...(escalation !== null ? { preface: escalation } : {}),
  });
}
