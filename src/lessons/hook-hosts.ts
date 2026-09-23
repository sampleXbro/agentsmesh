import type { RecallHookResult } from './hook-emit.js';
import type { HookStdin } from './hook-payload.js';

/**
 * Host adapters for the recall hook. The hook logic speaks Claude Code's
 * payload and output shapes; each adapter maps another host's documented
 * payload onto them and wraps the injected text back into that host's output.
 * Anything not recognized stays on the Claude Code path, unchanged.
 *
 * - Gemini CLI (geminicli.com/docs/hooks/reference): snake_case like Claude;
 *   `BeforeAgent` is its prompt event.
 * - Cursor (cursor.com/docs/agent/hooks): camelCase `hook_event_name`,
 *   top-level `additional_context` output.
 * - Copilot camelCase config (docs.github.com/en/copilot/reference/hooks-configuration):
 *   no event name, `sessionId`/`toolName`/`toolArgs`, flat `additionalContext`.
 */

export interface HookHost {
  /** The payload in Claude Code's field and event names. */
  readonly payload: HookStdin;
  /** Task-level recall on SessionStart, for hosts whose prompt event cannot inject. */
  readonly recallOnSessionStart: boolean;
  /** Put the injected text in this host's output shape. */
  readonly wrap: (result: RecallHookResult) => RecallHookResult;
}

type Raw = Record<string, unknown>;

const CURSOR_EVENTS: ReadonlyMap<string, string> = new Map([
  ['sessionStart', 'SessionStart'],
  ['postToolUseFailure', 'PostToolUseFailure'],
]);

function rewrap(
  result: RecallHookResult,
  shape: (context: string) => unknown,
  exitCode?: number,
): RecallHookResult {
  if (result.context === undefined) return result;
  return {
    output: JSON.stringify(shape(result.context)),
    context: result.context,
    ...(exitCode !== undefined ? { exitCode } : {}),
  };
}

/** Tool arguments as an object with `file_path`: JSON strings parsed, `path` aliased. */
function toolInput(args: unknown): Raw | undefined {
  let value = args;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Raw;
  return record.file_path === undefined && typeof record.path === 'string'
    ? { ...record, file_path: record.path }
    : record;
}

function firstString(value: unknown): string | undefined {
  return Array.isArray(value) && typeof value[0] === 'string' ? value[0] : undefined;
}

const claude = (raw: Raw): HookHost => ({
  payload: raw,
  recallOnSessionStart: false,
  wrap: (result) => result,
});

const gemini = (raw: Raw): HookHost => ({
  payload: { ...raw, hook_event_name: 'UserPromptSubmit' },
  recallOnSessionStart: false,
  wrap: (result) =>
    rewrap(result, (additionalContext) => ({
      hookSpecificOutput: { hookEventName: 'BeforeAgent', additionalContext },
    })),
});

/** Cursor has no session-start source: every sessionStart is a new context. */
const cursor = (raw: Raw, event: string): HookHost => ({
  payload: {
    ...raw,
    hook_event_name: event,
    session_id: raw.session_id ?? raw.conversation_id,
    cwd: raw.cwd ?? firstString(raw.workspace_roots),
    tool_input: toolInput(raw.tool_input) ?? null,
    ...(event === 'SessionStart' ? { source: 'startup' } : {}),
    ...(raw.error === undefined ? { error: raw.error_message } : {}),
  },
  recallOnSessionStart: true,
  wrap: (result) => rewrap(result, (additional_context) => ({ additional_context })),
});

const copilotStart = (raw: Raw): HookHost => ({
  payload: {
    session_id: raw.sessionId,
    cwd: raw.cwd,
    hook_event_name: 'SessionStart',
    source: raw.source,
    prompt: raw.initialPrompt,
  },
  recallOnSessionStart: true,
  wrap: (result) => rewrap(result, (additionalContext) => ({ additionalContext })),
});

/** Copilot reads a command hook's postToolUseFailure stdout on exit code 2. */
const copilotFailure = (raw: Raw): HookHost => ({
  payload: {
    session_id: raw.sessionId,
    cwd: raw.cwd,
    hook_event_name: 'PostToolUseFailure',
    tool_name: raw.toolName,
    tool_input: toolInput(raw.toolArgs) ?? null,
    error: raw.error,
  },
  recallOnSessionStart: true,
  wrap: (result) => rewrap(result, (additionalContext) => ({ additionalContext }), 2),
});

/** The host that sent `raw`, decided by its shape alone. */
export function detectHookHost(raw: Raw): HookHost {
  const event = raw.hook_event_name;
  if (event === 'BeforeAgent') return gemini(raw);
  if (typeof event === 'string') {
    const cursorEvent = CURSOR_EVENTS.get(event);
    return cursorEvent === undefined ? claude(raw) : cursor(raw, cursorEvent);
  }
  if (typeof raw.sessionId === 'string') {
    if (raw.toolName === undefined && typeof raw.source === 'string') return copilotStart(raw);
    if (typeof raw.toolName === 'string' && typeof raw.error === 'string') {
      return copilotFailure(raw);
    }
  }
  return claude(raw);
}
