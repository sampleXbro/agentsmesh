import { describe, expect, it } from 'vitest';
import { failureText } from '../../../src/lessons/failure-text.js';
import { contextOutput } from '../../../src/lessons/hook-emit.js';
import { detectHookHost } from '../../../src/lessons/hook-hosts.js';

const cursorFailure = {
  conversation_id: 'conv-1',
  hook_event_name: 'postToolUseFailure',
  workspace_roots: ['/project'],
  tool_name: 'Shell',
  tool_input: { command: 'npm test' },
  cwd: '/project',
  error_message: 'Command timed out after 30s',
  failure_type: 'timeout',
  is_interrupt: false,
};

describe('detectHookHost', () => {
  it("maps Cursor's error_message to the failure text failure-text.ts reads", () => {
    const { payload } = detectHookHost(cursorFailure);
    expect(failureText(payload)).toBe('Command timed out after 30s');
    expect(payload.hook_event_name).toBe('PostToolUseFailure');
    expect(payload.session_id).toBe('conv-1');
  });

  it('keeps a Cursor payload that already carries error', () => {
    const { payload } = detectHookHost({ ...cursorFailure, error: 'own text' });
    expect(failureText(payload)).toBe('own text');
  });

  it("uses Cursor sessionStart's first workspace root as the cwd", () => {
    const { payload, recallOnSessionStart } = detectHookHost({
      hook_event_name: 'sessionStart',
      session_id: 's1',
      workspace_roots: ['/a', '/b'],
    });
    expect(payload).toMatchObject({
      hook_event_name: 'SessionStart',
      cwd: '/a',
      source: 'startup',
    });
    expect(recallOnSessionStart).toBe(true);
  });

  it("maps Copilot's camelCase failure fields and error text", () => {
    const { payload } = detectHookHost({
      sessionId: 's2',
      timestamp: 1,
      cwd: '/project',
      toolName: 'bash',
      toolArgs: { command: 'npm test' },
      error: 'exit 1',
    });
    expect(payload).toMatchObject({
      session_id: 's2',
      hook_event_name: 'PostToolUseFailure',
      tool_name: 'bash',
      tool_input: { command: 'npm test' },
    });
    expect(failureText(payload)).toBe('exit 1');
  });

  it('passes a Claude Code payload through untouched', () => {
    const raw = { session_id: 's', hook_event_name: 'PreToolUse', tool_input: { file_path: 'a' } };
    const host = detectHookHost(raw);
    expect(host.payload).toBe(raw);
    expect(host.recallOnSessionStart).toBe(false);
    const result = contextOutput('PreToolUse', 'text');
    expect(host.wrap(result)).toBe(result);
  });

  it('only rewraps output that carries context', () => {
    const host = detectHookHost({ hook_event_name: 'BeforeAgent', prompt: 'x' });
    expect(host.wrap({ output: '' })).toEqual({ output: '' });
    expect(JSON.parse(host.wrap(contextOutput('UserPromptSubmit', 'ctx')).output)).toEqual({
      hookSpecificOutput: { hookEventName: 'BeforeAgent', additionalContext: 'ctx' },
    });
  });
});
