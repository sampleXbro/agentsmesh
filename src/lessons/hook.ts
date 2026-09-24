import { hookCommandFastpath } from './cmd-fastpath.js';
import { failureText } from './failure-text.js';
import {
  collectRecall,
  contextOutput,
  EMPTY,
  paragraphs,
  renderRecall,
  type RecallHookResult,
} from './hook-emit.js';
import { failureNudge } from './hook-failure.js';
import { detectHookHost, type HookHost } from './hook-hosts.js';
import { sessionNotices } from './hook-notices.js';
import {
  contextSessionId,
  hookAction,
  hookLocation,
  isReadOnlyTool,
  str,
  type HookAction,
  type HookStdin,
} from './hook-payload.js';
import { taskRecall } from './hook-prompt.js';
import { findLessonsRoot } from './paths.js';
import type { LessonsQuery } from './query.js';
import { recurrenceEscalation } from './recurrence-gate.js';
import { safeRuleLine } from './rule-line.js';
import { clearSeenForSessionStart } from './seen-cache.js';
import { stripBom } from '../utils/filesystem/fs-text-encoding.js';

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
 * This command is harness-adaptive: it reads the hook's stdin JSON, and on
 * anything it does not recognize — a parse failure, a shape without a
 * file/command, or zero matches — it emits NOTHING. A hook must never break the
 * harness or inject noise, so every failure path is a silent no-op (exit 0).
 */

/** Longest file list or command echoed in the lead line. */
const MAX_TARGET_CHARS = 200;

/**
 * Parse a hook stdin payload, recall lessons for the touched files / command /
 * change content, and return the host's context-injection JSON (or empty
 * output). Other hosts' payloads are mapped to Claude Code's shape first (see
 * hook-hosts.ts). The session id (narrowed to the subagent, see
 * contextSessionId) drives dedup, so a lesson is injected once per agent context.
 */
export async function buildRecallHookOutput(
  rawStdin: string,
  processCwd: string,
): Promise<RecallHookResult> {
  let raw: unknown;
  try {
    raw = JSON.parse(stripBom(rawStdin));
  } catch {
    return EMPTY;
  }
  if (typeof raw !== 'object' || raw === null) return EMPTY;
  const host = detectHookHost(raw as Record<string, unknown>);
  return host.wrap(await recallFor(host, processCwd));
}

async function recallFor(host: HookHost, processCwd: string): Promise<RecallHookResult> {
  const parsed = host.payload;
  const location = hookLocation(parsed, processCwd);
  // No lessons project here (e.g. the home folder): no recall, nudge or log.
  if (findLessonsRoot(location.root) === null) return EMPTY;
  const projectRoot = location.root;
  const sessionId = contextSessionId(parsed);

  // SessionStart resets dedup to match what actually happened to the context —
  // compact/clear discarded it, startup began a new chat, resume restored the old
  // one. See clearSeenForSessionStart. Claude Code's following prompt re-delivers;
  // hosts whose prompt event cannot inject get task recall right here.
  if (parsed.hook_event_name === 'SessionStart') {
    clearSeenForSessionStart(str(parsed.source), sessionId, projectRoot);
    if (!host.recallOnSessionStart) return EMPTY;
    return taskRecall(projectRoot, sessionId, str(parsed.prompt));
  }
  if (parsed.hook_event_name === 'UserPromptSubmit') {
    const task = str(parsed.prompt) ?? str(parsed.user_message);
    return taskRecall(projectRoot, sessionId, task);
  }

  const action = hookAction(parsed, location);
  // A patch touching several files is recorded against its first one.
  const file = action.files[0];
  const command = action.command;

  // A tool call FAILED — the moment for a capture decision. Claude Code fires a
  // dedicated PostToolUseFailure event; other harnesses instead carry the error TEXT
  // on a normally-named tool-call event, so detect failure by the event name OR a
  // non-empty `tool_error` (portable). This also stops a failed tool-call from being
  // mis-recorded as a successful delivery on a harness that reuses PostToolUse.
  const errorText = failureText(parsed);
  if (parsed.hook_event_name === 'PostToolUseFailure' || errorText !== undefined) {
    const event = str(parsed.hook_event_name);
    const interrupted = parsed.is_interrupt === true;
    const readOnly = isReadOnlyTool(parsed.tool_name);
    return failureNudge({
      event,
      projectRoot,
      sessionId,
      file,
      command,
      errorText,
      interrupted,
      readOnly,
    });
  }

  if (file === undefined && command === undefined) return EMPTY;
  // A missing event name is a tool call from a host that sends none; an event
  // name we do not know does nothing, so its output is never mislabelled.
  const eventName = parsed.hook_event_name;
  if (eventName !== undefined && eventName !== 'PreToolUse' && eventName !== 'PostToolUse') {
    return EMPTY;
  }
  return toolRecall(parsed, projectRoot, sessionId, action);
}

/**
 * Recall for a tool call: one query per touched file (the change content
 * folded in as keywords, so triggers match what is written), plus the
 * recurrence gate and any one-time notices above the recalled rules.
 */
async function toolRecall(
  parsed: HookStdin,
  projectRoot: string,
  sessionId: string | undefined,
  action: HookAction,
): Promise<RecallHookResult> {
  // Echo the harness's event so the SAME command serves as a PreToolUse first-touch
  // guard (injects BEFORE the edit) or a PostToolUse reactive hook; a payload
  // without an event name defaults to PostToolUse.
  const event = parsed.hook_event_name === 'PreToolUse' ? 'PreToolUse' : 'PostToolUse';
  const { command, keyword } = action;
  const queries: LessonsQuery[] = (action.files.length > 0 ? action.files : [undefined]).map(
    (file) => ({
      ...(file !== undefined ? { file } : {}),
      ...(command !== undefined ? { command } : {}),
      ...(keyword.length > 0 ? { keyword } : {}),
    }),
  );

  // Recurrence gate (PreToolUse only): the first-touch guard is the last moment
  // to stop a KNOWN repeat, so recurring covered actions escalate in ONE warning
  // above the regular recall bullets — see recurrence-gate.ts.
  const escalation =
    event === 'PreToolUse' ? recurrenceEscalation(projectRoot, queries, sessionId) : null;

  // Provable command-only no-match: skip the full recall load — see cmd-fastpath.ts.
  const fast = { file: action.files[0], command, keyword, sessionId };
  if (escalation === null && hookCommandFastpath(projectRoot, fast)) {
    const notices = paragraphs(await sessionNotices(projectRoot, sessionId, {}));
    return notices === undefined ? EMPTY : contextOutput(event, notices);
  }
  const shown = new Set(escalation?.ruleIds);
  const collected = await collectRecall(projectRoot, queries, sessionId, shown);
  const notices = await sessionNotices(projectRoot, sessionId, collected);
  const target = action.files.length > 0 ? action.files.join(', ') : (command ?? '');
  return renderRecall(collected, {
    event,
    lead: `Recalled agentsmesh lessons for ${safeRuleLine(target, MAX_TARGET_CHARS)}`,
    preface: paragraphs([escalation?.text ?? null, ...notices]),
  });
}
