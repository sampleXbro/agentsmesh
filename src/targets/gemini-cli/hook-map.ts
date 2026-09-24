/**
 * Canonical <-> Gemini CLI hooks: event names, the events whose output reaches
 * the model, and tool-name matchers (geminicli.com/docs/hooks/reference).
 */

/**
 * Canonical events whose Gemini output reaches the model as
 * `hookSpecificOutput.additionalContext`: BeforeAgent (the prompt event),
 * AfterTool and SessionStart. BeforeTool output has no additionalContext.
 */
export const GEMINI_HOOK_CONTEXT_EVENTS: readonly string[] = [
  'UserPromptSubmit',
  'SessionStart',
  'PostToolUse',
];

export const CANONICAL_TO_GEMINI: ReadonlyMap<string, string> = new Map([
  ['PreToolUse', 'BeforeTool'],
  ['PostToolUse', 'AfterTool'],
  ['Notification', 'Notification'],
  // BeforeAgent fires after the user submits a prompt and carries `prompt`.
  ['UserPromptSubmit', 'BeforeAgent'],
  // Older mapping, kept so existing SubagentStart hooks still reach Gemini.
  ['SubagentStart', 'BeforeAgent'],
  ['SubagentStop', 'AfterAgent'],
  ['SessionStart', 'SessionStart'],
]);

const GEMINI_TO_CANONICAL: ReadonlyMap<string, string> = new Map<string, string>([
  ...[...CANONICAL_TO_GEMINI].map(([canonical, gemini]): [string, string] => [gemini, canonical]),
  // BeforeAgent is shared with SubagentStart; import it as the prompt event.
  ['BeforeAgent', 'UserPromptSubmit'],
  // Legacy lowercase names.
  ['preToolUse', 'PreToolUse'],
  ['postToolUse', 'PostToolUse'],
  ['notification', 'Notification'],
]);

/** Gemini event for a canonical event, or null when Gemini has none. */
export function geminiHookEvent(event: string): string | null {
  return CANONICAL_TO_GEMINI.get(event) ?? null;
}

/** Canonical event for a Gemini event, or null when it has none. */
export function mapGeminiHookEvent(event: string): string | null {
  return GEMINI_TO_CANONICAL.get(event) ?? null;
}

/** Events whose matcher is tested against a tool name. */
const TOOL_EVENTS: ReadonlySet<string> = new Set(['BeforeTool', 'AfterTool']);

/** Canonical (Claude Code) tool names -> Gemini tool names (geminicli.com/docs/reference/tools). */
const CANONICAL_TO_GEMINI_TOOLS: ReadonlyMap<string, readonly string[]> = new Map([
  ['Bash', ['run_shell_command']],
  ['PowerShell', ['run_shell_command']],
  ['Edit', ['replace']],
  ['MultiEdit', ['replace']],
  ['Write', ['write_file']],
  ['NotebookEdit', []],
  ['Read', ['read_file', 'read_many_files']],
  ['Grep', ['grep_search']],
  ['Glob', ['glob']],
  ['LS', ['list_directory']],
  ['WebFetch', ['web_fetch']],
  ['WebSearch', ['google_web_search']],
  ['TodoWrite', ['write_todos']],
]);

const GEMINI_TO_CANONICAL_TOOLS: ReadonlyMap<string, string> = new Map([
  ['run_shell_command', 'Bash'],
  ['replace', 'Edit'],
  ['write_file', 'Write'],
  ['read_file', 'Read'],
  ['read_many_files', 'Read'],
  ['grep_search', 'Grep'],
  ['search_file_content', 'Grep'],
  ['glob', 'Glob'],
  ['list_directory', 'LS'],
  ['web_fetch', 'WebFetch'],
  ['google_web_search', 'WebSearch'],
  ['write_todos', 'TodoWrite'],
]);

/** A plain list of exact names, as Claude Code reads `Edit|Write` or `Edit, Write`. */
const NAME_LIST = /^[\w\s,|-]+$/;
/** The anchored list `toGeminiMatcher` writes. */
const ANCHORED_LIST = /^\^\(\?:(.*)\)\$$/;

function splitNames(list: string, separator: RegExp): string[] {
  return list
    .split(separator)
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

const unique = (values: readonly string[]): string[] => [...new Set(values)];

/**
 * Canonical tool matcher -> anchored regex of Gemini tool names, because Gemini
 * tests the matcher as a regex against its own names. Unknown names stay as
 * exact names; wildcards, regexes and non-tool events are unchanged.
 */
export function toGeminiMatcher(geminiEvent: string, matcher: string): string {
  if (!TOOL_EVENTS.has(geminiEvent) || !NAME_LIST.test(matcher)) return matcher;
  const tools = unique(
    splitNames(matcher, /[|,]/).flatMap((name) => CANONICAL_TO_GEMINI_TOOLS.get(name) ?? [name]),
  );
  return tools.length > 0 ? `^(?:${tools.join('|')})$` : matcher;
}

/** Gemini tool-name matcher (anchored or plain list) -> canonical names; else unchanged. */
export function fromGeminiMatcher(geminiEvent: string, matcher: string): string {
  if (!TOOL_EVENTS.has(geminiEvent)) return matcher;
  const list = ANCHORED_LIST.exec(matcher)?.[1] ?? matcher;
  if (!NAME_LIST.test(list) || list.includes(',')) return matcher;
  return unique(
    splitNames(list, /\|/).map((name) => GEMINI_TO_CANONICAL_TOOLS.get(name) ?? name),
  ).join('|');
}
