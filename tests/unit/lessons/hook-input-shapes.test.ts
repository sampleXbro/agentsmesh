/**
 * Hook payload shapes that used to be dropped: JSON with a UTF-8 BOM, the
 * Copilot VS Code SessionStart (snake_case with `initial_prompt`), and a
 * decomposed (NFD) path against an NFC glob.
 */

import { describe, expect, it } from 'vitest';
import { buildRecallHookOutput } from '../../../src/lessons/hook.js';
import { alwaysLesson, contextOf, graphOf, useHookProject } from './hook-test-helpers.js';

const KEYWORD_RULE = 'Guard every regex against redos.';
const CAFE_RULE = 'Keep the café menu sorted.';
const ALWAYS_RULE = 'Write short comments.';
const project = useHookProject(() => {
  const graph = graphOf({
    kw: { rule: KEYWORD_RULE, trigger: { kind: 'keyword', pattern: 'redos' } },
    cafe: { rule: CAFE_RULE, trigger: { kind: 'file_glob', pattern: 'src/café.ts' } },
  });
  graph.lessons.always = alwaysLesson(ALWAYS_RULE);
  return graph;
});

const run = async (raw: string): Promise<{ output: string }> =>
  buildRecallHookOutput(raw, project.root());

describe('hook payload shapes', () => {
  it('reads JSON that starts with a UTF-8 BOM', async () => {
    const payload = JSON.stringify({
      hook_event_name: 'UserPromptSubmit',
      session_id: project.session('bom'),
      prompt: 'fix the redos',
    });
    expect(contextOf((await run(`\uFEFF${payload}`)).output)).toContain(KEYWORD_RULE);
  });

  it('gives the Copilot VS Code SessionStart task recall, in its SessionStart shape', async () => {
    const { output } = await run(
      JSON.stringify({
        hook_event_name: 'SessionStart',
        session_id: project.session('vscode'),
        timestamp: '2026-09-23T10:00:00.000Z',
        cwd: project.root(),
        source: 'startup',
        initial_prompt: 'fix the redos',
      }),
    );
    const out = JSON.parse(output) as { hookSpecificOutput: Record<string, string> };
    expect(out.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(out.hookSpecificOutput.additionalContext).toContain(KEYWORD_RULE);
    expect(out.hookSpecificOutput.additionalContext).toContain(ALWAYS_RULE);
  });

  it('keeps a Claude Code SessionStart (no initial_prompt) to a dedup reset', async () => {
    const result = await run(
      JSON.stringify({
        hook_event_name: 'SessionStart',
        session_id: project.session('claude-start'),
        transcript_path: '/tmp/t.jsonl',
        cwd: project.root(),
        source: 'startup',
      }),
    );
    expect(result).toEqual({ output: '' });
  });

  it('matches a decomposed (NFD) path against an NFC glob', async () => {
    const ctx = contextOf(
      (
        await run(
          JSON.stringify({
            hook_event_name: 'PreToolUse',
            session_id: project.session('nfd'),
            tool_name: 'Edit',
            tool_input: { file_path: 'src/cafe\u0301.ts' },
          }),
        )
      ).output,
    );
    expect(ctx).toContain(CAFE_RULE);
  });
});
