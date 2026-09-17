import { describe, expect, it } from 'vitest';
import {
  createUnsupportedHookWarning,
  createWarning,
  unsupportedHookEventNames,
} from '../../../../src/core/lint/shared/helpers.js';

describe('createWarning', () => {
  it('produces a warning diagnostic', () => {
    expect(createWarning('a.md', 'cursor', 'msg')).toEqual({
      level: 'warning',
      file: 'a.md',
      target: 'cursor',
      message: 'msg',
    });
  });
});

describe('createUnsupportedHookWarning — Oxford comma', () => {
  it('formats single supported event', () => {
    const out = createUnsupportedHookWarning('UnknownHook', 'copilot', ['PreToolUse']);
    expect(out.message).toContain('only PreToolUse are projected');
  });

  it('formats two supported events with "and"', () => {
    const out = createUnsupportedHookWarning('UnknownHook', 'copilot', [
      'PreToolUse',
      'PostToolUse',
    ]);
    expect(out.message).toContain('only PreToolUse and PostToolUse are projected');
  });

  it('formats three supported events with Oxford comma', () => {
    const out = createUnsupportedHookWarning('UnknownHook', 'copilot', [
      'PreToolUse',
      'PostToolUse',
      'Notification',
    ]);
    expect(out.message).toContain('only PreToolUse, PostToolUse, and Notification are projected');
  });

  it('handles empty supported events', () => {
    const out = createUnsupportedHookWarning('UnknownHook', 'copilot', []);
    expect(out.message).toContain('only  are projected');
  });

  it('uses unsupportedBy when provided', () => {
    const out = createUnsupportedHookWarning('UnknownHook', 'copilot', ['PreToolUse'], {
      unsupportedBy: 'Copilot hooks',
    });
    expect(out.message).toContain('not supported by Copilot hooks');
  });

  it('falls back to target when unsupportedBy is not provided', () => {
    const out = createUnsupportedHookWarning('UnknownHook', 'cline', ['PreToolUse']);
    expect(out.message).toContain('not supported by cline');
  });
});

describe('unsupportedHookEventNames', () => {
  it('returns [] for null/empty hooks', () => {
    expect(unsupportedHookEventNames(null, ['PreToolUse'])).toEqual([]);
    expect(unsupportedHookEventNames({}, ['PreToolUse'])).toEqual([]);
  });

  it('returns events that are not in the supported set', () => {
    expect(unsupportedHookEventNames({ PreToolUse: [], Notification: [] }, ['PreToolUse'])).toEqual(
      ['Notification'],
    );
  });

  it('excludes BEST_EFFORT_HOOK_EVENTS so the recall/capture scaffold never nags', () => {
    // PostToolUseFailure + SessionStart are agentsmesh-injected best-effort recall
    // refinements; dropping one is not user data loss, so neither is reported.
    expect(
      unsupportedHookEventNames({ PostToolUseFailure: [], SessionStart: [], Notification: [] }, [
        'PreToolUse',
      ]),
    ).toEqual(['Notification']);
  });

  it('exempts a best-effort event only while every entry is the injected recall hook', () => {
    const recall = { matcher: '*', command: 'agentsmesh lessons hook' };
    const user = { matcher: '*', command: 'echo user' };
    expect(unsupportedHookEventNames({ UserPromptSubmit: [recall] }, ['PreToolUse'])).toEqual([]);
    expect(unsupportedHookEventNames({ UserPromptSubmit: [user] }, ['PreToolUse'])).toEqual([
      'UserPromptSubmit',
    ]);
    expect(unsupportedHookEventNames({ UserPromptSubmit: [recall, user] }, ['PreToolUse'])).toEqual(
      ['UserPromptSubmit'],
    );
  });
});
