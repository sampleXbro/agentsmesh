import { appendFileSync, chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { outcomeLogPath } from '../../../src/lessons/outcome-log.js';
import { recallLogPath, TELEMETRY_ENV } from '../../../src/lessons/telemetry.js';
import { graphOf, useHookProject } from './hook-test-helpers.js';

/**
 * The lessons logs are best-effort side channels: when one cannot be written
 * or read, the hook must still deliver its lessons and exit cleanly. A throw
 * here broke the host AND lost the lesson, because session dedup had already
 * marked it as shown.
 */

const FILE_RULE = 'Guard every ts edit.';
const KEYWORD_RULE = 'Guard every regex against redos.';
const project = useHookProject(() =>
  graphOf({
    f: { rule: FILE_RULE, trigger: { kind: 'file_glob', pattern: 'src/**/*.ts' } },
    k: { rule: KEYWORD_RULE, trigger: { kind: 'keyword', pattern: 'redos' } },
  }),
);

const noChmod = process.platform === 'win32' || process.getuid?.() === 0;
const lessonsDir = (): string => join(project.root(), '.agentsmesh', 'lessons');

afterEach(() => {
  chmodSync(lessonsDir(), 0o755);
});

const edit = (session: string): Record<string, unknown> => ({
  session_id: session,
  hook_event_name: 'PreToolUse',
  tool_name: 'Edit',
  tool_input: { file_path: 'src/a.ts' },
  cwd: project.root(),
});
const failed = (session: string): Record<string, unknown> => ({
  session_id: session,
  hook_event_name: 'PostToolUseFailure',
  tool_name: 'Bash',
  tool_input: { command: 'npm test' },
  error: 'Process exited with code 1',
  cwd: project.root(),
});
const prompt = (session: string): Record<string, unknown> => ({
  session_id: session,
  hook_event_name: 'UserPromptSubmit',
  prompt: 'fix the redos bug',
  cwd: project.root(),
});

function readOnlyFile(path: string): void {
  writeFileSync(path, '', 'utf8');
  chmodSync(path, 0o444);
}

describe('hook with an unwritable outcome log', () => {
  it.skipIf(noChmod)('delivers the lesson once when outcome-log.jsonl is read-only', async () => {
    readOnlyFile(outcomeLogPath(project.root()));
    const s = project.session('ro-file');
    expect(await project.recall(edit(s))).toContain(FILE_RULE);
    expect(await project.recall(edit(s))).toBe('');
  });

  it.skipIf(noChmod)('delivers the lesson when the lessons directory is read-only', async () => {
    chmodSync(lessonsDir(), 0o555);
    expect(await project.recall(edit(project.session('ro-dir')))).toContain(FILE_RULE);
  });

  it('delivers the lesson when outcome-log.jsonl is a directory', async () => {
    mkdirSync(outcomeLogPath(project.root()));
    expect(await project.recall(edit(project.session('dir-log')))).toContain(FILE_RULE);
  });

  it.skipIf(noChmod)('still nudges on PostToolUseFailure when the log is read-only', async () => {
    readOnlyFile(outcomeLogPath(project.root()));
    expect(await project.recall(failed(project.session('ro-fail')))).toContain('lessons add');
  });
});

describe('hook with an unwritable recall log (telemetry on)', () => {
  it.skipIf(noChmod)('delivers task recall when recall-log.jsonl is read-only', async () => {
    vi.stubEnv(TELEMETRY_ENV, '1');
    readOnlyFile(recallLogPath(project.root()));
    expect(await project.recall(prompt(project.session('ro-recall')))).toContain(KEYWORD_RULE);
  });
});

describe('hook with a malformed outcome log', () => {
  it('ignores a null line on PreToolUse and on PostToolUseFailure', async () => {
    const path = outcomeLogPath(project.root());
    appendFileSync(path, 'null\n42\n{"kind":"failure"}\n', 'utf8');
    expect(await project.recall(edit(project.session('null-edit')))).toContain(FILE_RULE);
    expect(await project.recall(failed(project.session('null-fail')))).toContain('lessons add');
  });
});

describe('hook with an unreadable generation lock', () => {
  it('skips the version notice when .agentsmesh/.lock is a directory', async () => {
    mkdirSync(join(project.root(), '.agentsmesh', '.lock'));
    const ctx = await project.recall(edit(project.session('lock-dir')));
    expect(ctx).toContain(FILE_RULE);
    expect(ctx).not.toContain('older');
  });
});
