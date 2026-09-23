/**
 * End to end through the hook: a real Claude Code failure payload is recorded
 * with an error class, a successful command is never recorded as a failure, and
 * nothing raw (command text, error text) reaches the outcome log.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRecallHookOutput } from '../../../src/lessons/hook.js';
import { outcomeLogPath, readOutcomeLog } from '../../../src/lessons/outcome-log.js';
import { OUTCOME_LOG_ENV, SESSION_ENV, TELEMETRY_ENV } from '../../../src/lessons/telemetry.js';

let root: string;
const sessions: string[] = [];
let counter = 0;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'amesh-hook-classify-'));
  // Telemetry OFF: the outcome log must record by default without it.
  vi.stubEnv(TELEMETRY_ENV, '');
  vi.stubEnv(OUTCOME_LOG_ENV, '');
  vi.stubEnv(SESSION_ENV, '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
  for (const id of sessions.splice(0)) {
    rmSync(join(tmpdir(), 'agentsmesh-lessons-seen', `${id}.json`), { force: true });
  }
});

function session(): string {
  const id = `classify-${process.pid}-${counter++}`;
  sessions.push(id);
  return id;
}

/** The documented PostToolUseFailure example; cwd/session_id point at this test's sandbox. */
function documentedFailure(): Record<string, unknown> {
  return {
    session_id: session(),
    transcript_path: '/Users/.../.claude/projects/.../00893aaf-19fa-41d2-8238-13269b9b3ca0.jsonl',
    cwd: root,
    permission_mode: 'default',
    hook_event_name: 'PostToolUseFailure',
    tool_name: 'Bash',
    tool_input: { command: 'npm test', description: 'Run test suite' },
    tool_use_id: 'toolu_01ABC123...',
    error: "Exit code 1\nError: Cannot find module 'express'",
    is_interrupt: false,
    duration_ms: 4187,
  };
}

describe('hook failure recording', () => {
  it('records the documented Claude Code failure with its error class', async () => {
    const payload = documentedFailure();
    await buildRecallHookOutput(JSON.stringify(payload), root);
    expect(readOutcomeLog(root)).toEqual([
      {
        ts: expect.any(String),
        kind: 'failure',
        contextKey: 'cmd:npm test',
        errorClass: 'error: cannot find module …',
        session: payload.session_id,
      },
    ]);
  });

  it('never records a user interrupt as a failure of the action', async () => {
    await buildRecallHookOutput(
      JSON.stringify({ ...documentedFailure(), error: 'Interrupted by user', is_interrupt: true }),
      root,
    );
    expect(readOutcomeLog(root)).toEqual([]);
  });

  it('never records a successful Bash call as a failure', async () => {
    await buildRecallHookOutput(
      JSON.stringify({
        session_id: session(),
        cwd: root,
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'npm test' },
        tool_response: { stdout: 'ok', stderr: 'npm warn x', interrupted: false, isImage: false },
      }),
      root,
    );
    expect(readOutcomeLog(root).filter((e) => e.kind === 'failure')).toEqual([]);
  });

  it('writes no raw command or error text to the outcome log', async () => {
    await buildRecallHookOutput(
      JSON.stringify({
        ...documentedFailure(),
        tool_input: {
          command:
            "cd /repo && TOKEN=sk-live-9f2 curl -H 'Authorization: Bearer abc' https://api.example.com",
        },
        error:
          'Exit code 22\ncurl: (22) The requested URL returned error: 401 https://api.example.com/?token=abc',
      }),
      root,
    );
    const raw = readFileSync(outcomeLogPath(root), 'utf8');
    for (const secret of ['sk-live', 'Bearer', 'token=abc', 'api.example.com', '/repo']) {
      expect(raw).not.toContain(secret);
    }
    expect(readOutcomeLog(root)).toEqual([
      expect.objectContaining({
        contextKey: 'cmd:curl',
        errorClass: 'curl: (…) the requested url returned error: … …',
      }),
    ]);
  });
});
