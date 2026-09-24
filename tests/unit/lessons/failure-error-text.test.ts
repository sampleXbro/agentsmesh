/**
 * Extracting the failure text a harness reports.
 *
 * 0 of 247 failures in this repo's outcome log carried an error class: Claude
 * Code puts the text in a top-level `error` string, which the extractor never
 * read. Success payloads also carry output (Bash `stdout`/`stderr`), so response
 * fields may only be read when something marks the call as failed.
 */

import { describe, it, expect } from 'vitest';
import { errorClass } from '../../../src/lessons/error-class.js';
import { failureText } from '../../../src/lessons/failure-text.js';

/** Verbatim PostToolUseFailure example from code.claude.com/docs/en/hooks. */
const CLAUDE_CODE_BASH_FAILURE = {
  session_id: 'abc123',
  transcript_path: '/Users/.../.claude/projects/.../00893aaf-19fa-41d2-8238-13269b9b3ca0.jsonl',
  cwd: '/Users/...',
  permission_mode: 'default',
  hook_event_name: 'PostToolUseFailure',
  tool_name: 'Bash',
  tool_input: { command: 'npm test', description: 'Run test suite' },
  tool_use_id: 'toolu_01ABC123...',
  error: "Exit code 1\nError: Cannot find module 'express'",
  is_interrupt: false,
  duration_ms: 4187,
};

const FAILED = { hook_event_name: 'PostToolUseFailure' } as const;

describe('failureText — Claude Code documented payload', () => {
  it('reads the top-level `error` string of PostToolUseFailure', () => {
    expect(failureText(CLAUDE_CODE_BASH_FAILURE)).toBe(
      "Exit code 1\nError: Cannot find module 'express'",
    );
  });

  it('classes that payload on the line after `Exit code N`', () => {
    expect(errorClass(failureText(CLAUDE_CODE_BASH_FAILURE))).toBe('error: cannot find module …');
  });

  it('prefers tool_error over the top-level error', () => {
    expect(failureText({ tool_error: 'boom', error: 'other' })).toBe('boom');
  });
});

describe('failureText — success output is never failure text', () => {
  it('ignores Bash stdout and stderr on a PostToolUse success', () => {
    const success = {
      hook_event_name: 'PostToolUse',
      tool_response: {
        stdout: 'done',
        stderr: 'npm warn deprecated',
        interrupted: false,
        isImage: false,
      },
    };
    expect(failureText(success)).toBeUndefined();
  });

  it('ignores a plain string response and a generic message without a failure signal', () => {
    expect(failureText({ tool_response: 'command not found' })).toBeUndefined();
    expect(failureText({ tool_response: { message: 'created' } })).toBeUndefined();
  });

  it.each([
    [{ is_error: true, stdout: 'Error: build failed' }],
    [{ isError: true, stdout: 'Error: build failed' }],
    [{ exit_code: 2, stdout: 'Error: build failed' }],
    [{ exitCode: 1, stdout: 'Error: build failed' }],
    [{ resultType: 'failure', stdout: 'Error: build failed' }],
  ])('reads stdout when the response itself signals failure (%o)', (response) => {
    expect(failureText({ hook_event_name: 'PostToolUse', tool_response: response })).toBe(
      'Error: build failed',
    );
  });

  it('a zero exit code is not a failure signal', () => {
    expect(failureText({ tool_response: { exit_code: 0, stdout: 'ok' } })).toBeUndefined();
  });
});

describe('failureText — structured responses of a failed call', () => {
  it('prefers an explicit string error field', () => {
    expect(failureText({ tool_error: 'boom', tool_response: 'ignored' })).toBe('boom');
  });

  it('accepts a plain string response on a failure event', () => {
    expect(failureText({ ...FAILED, tool_response: 'command not found' })).toBe(
      'command not found',
    );
  });

  it('reads stderr out of a structured response', () => {
    expect(
      failureText({
        ...FAILED,
        tool_response: { stdout: '', stderr: 'fatal: not a git repository' },
      }),
    ).toBe('fatal: not a git repository');
  });

  it.each([
    [{ error: 'ENOENT: no such file' }, 'ENOENT: no such file'],
    [{ errorMessage: 'exit status 2' }, 'exit status 2'],
  ])('an explicit error field is its own failure signal', (response, expected) => {
    expect(failureText({ tool_response: response })).toBe(expected);
  });

  it('reads a generic message on a failure event', () => {
    expect(failureText({ ...FAILED, tool_response: { message: 'permission denied' } })).toBe(
      'permission denied',
    );
  });

  it('prefers stderr over a less specific sibling field', () => {
    const response = { message: 'generic', stderr: 'the real cause' };
    expect(failureText({ ...FAILED, tool_response: response })).toBe('the real cause');
  });

  it('falls back to stdout when a failure reported nothing on stderr', () => {
    const response = { stdout: 'Error: build failed', stderr: '' };
    expect(failureText({ ...FAILED, tool_response: response })).toBe('Error: build failed');
  });

  it('returns undefined when there is genuinely no text', () => {
    expect(failureText({})).toBeUndefined();
    expect(failureText({ ...FAILED })).toBeUndefined();
    expect(failureText({ ...FAILED, tool_response: {} })).toBeUndefined();
    expect(failureText({ ...FAILED, tool_response: { stdout: '', stderr: '' } })).toBeUndefined();
    expect(failureText({ ...FAILED, tool_response: 42 })).toBeUndefined();
  });

  it('ignores a non-string value in a conventional field', () => {
    expect(failureText({ ...FAILED, tool_response: { stderr: { nested: true } } })).toBeUndefined();
  });
});
