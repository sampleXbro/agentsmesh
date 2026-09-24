/**
 * A failed read-only tool call (Read of a file that does not exist yet, a bad
 * glob) acts on nothing. It still gets the generic capture nudge, but it must
 * not be recorded as a failure of the file — or read-then-create would look
 * like a recurring failure when the file is later written.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRecallHookOutput } from '../../../src/lessons/hook.js';
import { readOutcomeLog } from '../../../src/lessons/outcome-log.js';
import { OUTCOME_LOG_ENV } from '../../../src/lessons/telemetry.js';
import { graphOf, useHookProject } from './hook-test-helpers.js';

const RULE = 'Create new src modules from the template.';
const ERROR = 'File does not exist.';
const GENERIC_HINT = "--trigger-file '<glob>'";

const project = useHookProject(() =>
  graphOf({ src: { rule: RULE, trigger: { kind: 'file_glob', pattern: 'src/**' } } }),
);

beforeEach(() => {
  vi.stubEnv(OUTCOME_LOG_ENV, '');
});

/** The injected text in any host's output shape, or '' for no output. */
async function hook(payload: Record<string, unknown>): Promise<string> {
  const result = await buildRecallHookOutput(JSON.stringify(payload), project.root());
  return result.context ?? '';
}

const claudeFailure = (tool: string, session: string): Record<string, unknown> => ({
  session_id: session,
  cwd: project.root(),
  hook_event_name: 'PostToolUseFailure',
  tool_name: tool,
  tool_input: { file_path: `${project.root()}/src/new.ts` },
  error: ERROR,
});

const HOST_PAYLOADS: ReadonlyArray<[string, (tool: string) => Record<string, unknown>]> = [
  ['Claude Code', (tool) => claudeFailure(tool, project.session('claude'))],
  [
    'Gemini CLI',
    (tool) => ({
      session_id: project.session('gemini'),
      cwd: project.root(),
      hook_event_name: 'AfterTool',
      tool_name: tool,
      tool_input: { file_path: 'src/new.ts' },
      tool_response: { error: ERROR },
    }),
  ],
  [
    'Copilot',
    (tool) => ({
      sessionId: project.session('copilot'),
      cwd: project.root(),
      toolName: tool,
      toolArgs: JSON.stringify({ path: 'src/new.ts' }),
      error: ERROR,
    }),
  ],
  [
    'Cursor',
    (tool) => ({
      conversation_id: project.session('cursor'),
      workspace_roots: [project.root()],
      hook_event_name: 'postToolUseFailure',
      tool_name: tool,
      tool_input: { file_path: 'src/new.ts' },
      error_message: ERROR,
    }),
  ],
];

const READ_ONLY_TOOLS: Readonly<Record<string, readonly string[]>> = {
  'Claude Code': ['Read', 'Glob', 'Grep', 'LS', 'NotebookRead', 'WebFetch', 'WebSearch'],
  'Gemini CLI': [
    'read_file',
    'read_many_files',
    'list_directory',
    'glob',
    'search_file_content',
    'grep_search',
    'google_web_search',
    'web_fetch',
  ],
  Copilot: ['view', 'glob', 'grep', 'web_fetch'],
  Cursor: ['Read', 'Grep', 'read_file', 'list_dir', 'codebase_search', 'file_search'],
};

describe('a failed read-only tool call is action-less', () => {
  for (const [host, payload] of HOST_PAYLOADS) {
    for (const tool of READ_ONLY_TOOLS[host]!) {
      it(`${host} ${tool}: records nothing and nudges without a file hint`, async () => {
        const ctx = await hook(payload(tool));
        expect(readOutcomeLog(project.root())).toEqual([]);
        expect(ctx).toContain(GENERIC_HINT);
        expect(ctx).not.toContain('src/new.ts');
      });
    }
  }

  it('read-then-create never escalates the later Write as a recurrent failure', async () => {
    await hook(claudeFailure('Read', project.session('r1')));
    await hook(claudeFailure('Read', project.session('r2')));
    const ctx = await hook({
      session_id: project.session('r3'),
      cwd: project.root(),
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: `${project.root()}/src/new.ts`, content: 'x' },
    });
    expect(ctx).not.toContain('RECURRENT FAILURE');
    expect(ctx).toContain(`- [src] ${RULE}`);
  });
});

describe('a failed tool call that is not known to be read-only keeps its file', () => {
  for (const tool of ['Write', 'mcp__fs__read_text']) {
    it(`${tool}: records the failure against the file and hints it`, async () => {
      const ctx = await hook(claudeFailure(tool, project.session('unknown')));
      expect(readOutcomeLog(project.root())).toEqual([
        expect.objectContaining({ kind: 'failure', contextKey: 'file:src/new.ts' }),
      ]);
      expect(ctx).toContain("--trigger-file 'src/new.ts'");
    });
  }
});
