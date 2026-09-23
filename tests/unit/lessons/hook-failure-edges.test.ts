/**
 * Failure-side hook edges: the recurrence count covers the last 24 hours only
 * (it used to count every failure ever, "failed 833×"), a Cursor
 * permission_denied is the user's choice and is not recorded as a failure, and
 * a failed command's nudge does not suggest a file-class glob.
 */

import { describe, expect, it } from 'vitest';
import { contextKey } from '../../../src/lessons/context-key.js';
import { buildRecallHookOutput } from '../../../src/lessons/hook.js';
import { appendOutcomeEvent, readOutcomeLog } from '../../../src/lessons/outcome-log.js';
import { graphOf, useHookProject } from './hook-test-helpers.js';

const RULE = 'Edit x carefully.';
const FILE_CLASS_HINT = 'Trigger where it will RECUR';
const project = useHookProject(() =>
  graphOf({ x: { rule: RULE, trigger: { kind: 'file_glob', pattern: 'src/x.ts' } } }),
);

const failAt = (ts: string): void =>
  appendOutcomeEvent(project.root(), {
    ts,
    kind: 'failure',
    contextKey: contextKey({ file: 'src/x.ts' }, project.root()),
    errorClass: 'same error',
  });

const firstTouch = (session: string): Record<string, unknown> => ({
  hook_event_name: 'PreToolUse',
  session_id: session,
  tool_name: 'Edit',
  tool_input: { file_path: 'src/x.ts' },
});

describe('recurrence count window', () => {
  it('ignores failures older than 24 hours', async () => {
    const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    failAt(old);
    failAt(old);
    expect(await project.recall(firstTouch(project.session('old')))).not.toContain('RECURRENT');
  });

  it('counts the recent ones and says so', async () => {
    const recent = new Date().toISOString();
    failAt(recent);
    failAt(recent);
    failAt(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString());
    expect(await project.recall(firstTouch(project.session('recent')))).toContain(
      'RECURRENT FAILURE: this action has failed 2× in the last 24 hours with the same error',
    );
  });
});

describe('failure nudges', () => {
  it('does not record a Cursor permission_denied as a failure', async () => {
    const payload = {
      hook_event_name: 'postToolUseFailure',
      conversation_id: project.session('cursor-denied'),
      cwd: project.root(),
      tool_name: 'Shell',
      tool_input: { command: 'rm -rf build' },
      error_message: 'Permission denied by the user',
      failure_type: 'permission_denied',
    };
    await buildRecallHookOutput(JSON.stringify(payload), project.root());
    expect(readOutcomeLog(project.root()).filter((e) => e.kind === 'failure')).toEqual([]);
  });

  it('gives a failed command no file-class glob hint', async () => {
    const ctx = await project.recall({
      hook_event_name: 'PostToolUseFailure',
      session_id: project.session('cmd-fail'),
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m x' },
      error: 'Exit code 1\nnothing to commit',
    });
    expect(ctx).toContain("--trigger-cmd '\\bgit commit\\b'");
    expect(ctx).not.toContain(FILE_CLASS_HINT);
  });

  it('keeps the file-class hint for a failed file edit', async () => {
    const ctx = await project.recall({
      hook_event_name: 'PostToolUseFailure',
      session_id: project.session('file-fail'),
      tool_name: 'Edit',
      tool_input: { file_path: 'src/y.ts' },
      error: 'String to replace not found',
    });
    expect(ctx).toContain(FILE_CLASS_HINT);
  });
});
