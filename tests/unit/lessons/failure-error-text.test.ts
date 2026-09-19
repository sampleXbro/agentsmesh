/**
 * Extracting the failure text a harness reports.
 *
 * The recurrence gate is designed around a coarse error CLASS, but the class was
 * empty on every one of this repo's 206 recorded failures: Claude Code reports a
 * failed Bash call with a structured `tool_response`, and the extractor only
 * accepted a plain string. With no signature, "this exact action has failed N
 * times before" could only ever mean "some command in this class failed", which
 * is why an ordinary `cat` looked like a recurring defect.
 */

import { describe, it, expect } from 'vitest';
import { failureText } from '../../../src/lessons/failure-text.js';

describe('failureText', () => {
  it('prefers an explicit string error field', () => {
    expect(failureText({ tool_error: 'boom', tool_response: 'ignored' })).toBe('boom');
  });

  it('accepts a plain string response', () => {
    expect(failureText({ tool_response: 'command not found' })).toBe('command not found');
  });

  it('reads stderr out of a structured response', () => {
    expect(
      failureText({ tool_response: { stdout: '', stderr: 'fatal: not a git repository' } }),
    ).toBe('fatal: not a git repository');
  });

  it.each([
    [{ error: 'ENOENT: no such file' }, 'ENOENT: no such file'],
    [{ message: 'permission denied' }, 'permission denied'],
    [{ errorMessage: 'exit status 2' }, 'exit status 2'],
  ])('reads other conventional error fields', (response, expected) => {
    expect(failureText({ tool_response: response })).toBe(expected);
  });

  it('prefers stderr over a less specific sibling field', () => {
    expect(failureText({ tool_response: { message: 'generic', stderr: 'the real cause' } })).toBe(
      'the real cause',
    );
  });

  it('falls back to stdout when a failure reported nothing on stderr', () => {
    expect(failureText({ tool_response: { stdout: 'Error: build failed', stderr: '' } })).toBe(
      'Error: build failed',
    );
  });

  it('returns undefined when there is genuinely no text', () => {
    expect(failureText({})).toBeUndefined();
    expect(failureText({ tool_response: {} })).toBeUndefined();
    expect(failureText({ tool_response: { stdout: '', stderr: '' } })).toBeUndefined();
    expect(failureText({ tool_response: 42 })).toBeUndefined();
  });

  it('ignores a non-string value in a conventional field', () => {
    expect(failureText({ tool_response: { stderr: { nested: true } } })).toBeUndefined();
  });
});
