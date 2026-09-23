import { isAbsolute, resolve } from 'node:path';
import { diffTerms } from './diff-terms.js';
import { normalizeRecallFile } from './normalize-query-file.js';
import { patchFromToolInput } from './patch-paths.js';
import { resolveLessonsRoot } from './paths.js';

/**
 * Reading a harness hook payload: which agent context it belongs to, which
 * project it is for, and which files / command / written text it touches.
 * Split from hook.ts, which decides what to do with them.
 */

export interface HookStdin {
  readonly session_id?: unknown;
  /** Set on Claude Code subagent tool calls; the session_id is the parent's. */
  readonly agent_id?: unknown;
  /** The session's working directory (Claude Code, Codex). */
  readonly cwd?: unknown;
  readonly hook_event_name?: unknown;
  readonly tool_name?: unknown;
  /** SessionStart's origin: `startup` | `resume` | `clear` | `compact`. */
  readonly source?: unknown;
  /** UserPromptSubmit carries the raw task text here (no `tool_input`). */
  readonly prompt?: unknown;
  /** Alternate field name some harnesses use for the submitted prompt. */
  readonly user_message?: unknown;
  /** Failure text: Claude Code sends `error`, other harnesses `tool_error`. */
  readonly error?: unknown;
  /** Claude Code: the user stopped the tool; not the agent's mistake. */
  readonly is_interrupt?: unknown;
  readonly tool_error?: unknown;
  readonly tool_response?: unknown;
  readonly tool_input?: {
    readonly file_path?: unknown;
    /** NotebookEdit uses `notebook_path` instead of `file_path`. */
    readonly notebook_path?: unknown;
    readonly command?: unknown;
    /** Codex `apply_patch` may carry the patch here instead of in `command`. */
    readonly patch?: unknown;
    /** Diff-aware recall reads the content being written — see diff-terms.ts. */
    readonly new_string?: unknown;
    readonly content?: unknown;
    readonly edits?: unknown;
  } | null;
}

export const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;

/** Upper bound on per-path recalls (one graph load each) for one multi-file patch. */
const MAX_PATCH_PATHS = 8;

/**
 * Dedup scope of this payload. A Claude Code subagent sends its parent's
 * session_id plus an agent_id, yet starts with an empty context, so it gets
 * its own scope. The main agent keeps the bare session id, which is what
 * SessionStart resets and what earlier builds wrote.
 */
export function contextSessionId(parsed: HookStdin): string | undefined {
  const session = str(parsed.session_id);
  if (session === undefined) return undefined;
  const agent = str(parsed.agent_id);
  return agent === undefined ? session : `${session}:agent-${agent}`;
}

export interface HookLocation {
  /** Directory the payload's relative paths are relative to. */
  readonly start: string;
  /** Project whose lessons apply (see resolveLessonsRoot). */
  readonly root: string;
}

/** Start from the payload cwd, else CLAUDE_PROJECT_DIR, else the process cwd. */
export function hookLocation(parsed: HookStdin, processCwd: string): HookLocation {
  const start = resolve(processCwd, str(parsed.cwd) ?? str(process.env.CLAUDE_PROJECT_DIR) ?? '.');
  return { start, root: resolveLessonsRoot(start) };
}

export interface HookAction {
  /** Touched files, relative to the lessons root. */
  readonly files: readonly string[];
  readonly command?: string;
  /** Token bag of the text being written, for keyword triggers. */
  readonly keyword: string;
}

function rootRelative(file: string, location: HookLocation): string {
  const forward = file.replaceAll('\\', '/');
  const absolute = isAbsolute(forward) ? forward : resolve(location.start, forward);
  return normalizeRecallFile(absolute, location.root);
}

/** The files, command and written text of a tool call; a patch is files, not a command. */
export function hookAction(parsed: HookStdin, location: HookLocation): HookAction {
  const input = parsed.tool_input ?? undefined;
  const patch = patchFromToolInput(parsed.tool_name, input);
  if (patch !== null) {
    return {
      files: patch.paths.slice(0, MAX_PATCH_PATHS).map((p) => rootRelative(p, location)),
      keyword: diffTerms({ content: patch.added }),
    };
  }
  const file = str(input?.file_path) ?? str(input?.notebook_path);
  const command = str(input?.command);
  return {
    files: file === undefined ? [] : [rootRelative(file, location)],
    ...(command !== undefined ? { command } : {}),
    keyword: input === undefined ? '' : diffTerms(input),
  };
}
