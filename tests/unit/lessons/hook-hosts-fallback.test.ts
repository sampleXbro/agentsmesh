import { describe, expect, it } from 'vitest';
import { buildRecallHookOutput } from '../../../src/lessons/hook.js';
import { graphOf, useHookProject } from './hook-test-helpers.js';

const KEYWORD = 'Guard every regex against redos.';
const project = useHookProject(() =>
  graphOf({ kw: { rule: KEYWORD, trigger: { kind: 'keyword', pattern: 'redos' } } }),
);

async function run(payload: Record<string, unknown>): Promise<{ output: string }> {
  return buildRecallHookOutput(JSON.stringify(payload), project.root(), {});
}

describe('unrecognized shapes keep the Claude Code behaviour', () => {
  it('answers a Claude-shaped payload with hookSpecificOutput even when it carries a stray sessionId', async () => {
    const { output } = await run({
      sessionId: 'stray',
      session_id: project.session('claude'),
      hook_event_name: 'UserPromptSubmit',
      prompt: 'fix redos',
    });
    const out = JSON.parse(output) as { hookSpecificOutput: Record<string, string> };
    expect(Object.keys(out)).toEqual(['hookSpecificOutput']);
    expect(out.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
    expect(out.hookSpecificOutput.additionalContext).toContain(KEYWORD);
  });

  it('leaves a camelCase payload it does not model on the Claude path (no output, exit code unset)', async () => {
    const result = await run({
      sessionId: project.session('cp-pre'),
      timestamp: 1_704_614_400_000,
      toolName: 'bash',
      toolArgs: { command: 'npm test' },
    });
    expect(result).toEqual({ output: '' });
  });

  it('answers an unknown hook_event_name in the Claude shape, defaulting to PostToolUse', async () => {
    const { output } = await run({
      hook_event_name: 'SomethingElse',
      tool_input: { file_path: 'a.ts', new_string: 'avoid redos here' },
    });
    const out = JSON.parse(output) as { hookSpecificOutput: Record<string, string> };
    expect(out.hookSpecificOutput.hookEventName).toBe('PostToolUse');
    expect(out.hookSpecificOutput.additionalContext).toContain(KEYWORD);
  });
});
