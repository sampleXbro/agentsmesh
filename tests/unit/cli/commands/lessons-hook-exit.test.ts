/**
 * Copilot only reads a postToolUseFailure hook's additionalContext when the
 * hook exits 2. The hook logic asks for that code; the CLI must pass it on
 * instead of always exiting 0.
 */

import { Readable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { runLessons } from '../../../../src/cli/commands/lessons.js';
import { graphOf, useHookProject } from '../../lessons/hook-test-helpers.js';

const project = useHookProject(() =>
  graphOf({ k: { rule: 'Guard every regex.', trigger: { kind: 'keyword', pattern: 'redos' } } }),
);

const realStdin = Object.getOwnPropertyDescriptor(process, 'stdin');
afterEach(() => {
  if (realStdin !== undefined) Object.defineProperty(process, 'stdin', realStdin);
});

function feedStdin(payload: Record<string, unknown>): void {
  Object.defineProperty(process, 'stdin', {
    configurable: true,
    value: Readable.from([Buffer.from(JSON.stringify(payload))]),
  });
}

describe('lessons hook exit code', () => {
  it('exits 2 on a Copilot postToolUseFailure so Copilot reads the nudge', async () => {
    feedStdin({
      sessionId: project.session('cli-cp'),
      timestamp: 1_704_614_400_000,
      cwd: project.root(),
      toolName: 'bash',
      toolArgs: { command: 'npm test' },
      error: 'Process exited with code 1',
    });
    const r = await runLessons({}, ['hook'], project.root());
    expect(r.subcommand).toBe('hook');
    if (r.subcommand !== 'hook') return;
    expect(r.data.output).toContain('additionalContext');
    expect(r.exitCode).toBe(2);
  });

  it('exits 0 for a Claude Code payload', async () => {
    feedStdin({
      session_id: project.session('cli-cc'),
      cwd: project.root(),
      hook_event_name: 'UserPromptSubmit',
      prompt: 'fix the redos bug',
    });
    const r = await runLessons({}, ['hook'], project.root());
    if (r.subcommand !== 'hook') throw new Error('expected hook');
    expect(r.data.output).toContain('Guard every regex.');
    expect(r.exitCode).toBe(0);
  });
});
