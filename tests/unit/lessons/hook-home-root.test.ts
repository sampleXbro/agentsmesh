/**
 * `~/.agentsmesh` is the global config folder, never a lessons project. A
 * session started in the home folder must not recall a stray graph there, and
 * must not write failure logs into it.
 */

import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveLessonsGraph } from '../../../src/lessons/graph-store.js';
import { buildRecallHookOutput } from '../../../src/lessons/hook.js';
import { lessonsPaths } from '../../../src/lessons/paths.js';
import { graphOf } from './hook-test-helpers.js';

const fakeHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: (): string => fakeHome.dir };
});

let base: string;
beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), 'amesh-hook-home-')));
  fakeHome.dir = join(base, 'home');
  mkdirSync(fakeHome.dir, { recursive: true });
  saveLessonsGraph(
    fakeHome.dir,
    graphOf({ stray: { rule: 'Stray home rule.', trigger: { kind: 'file_glob', pattern: '**' } } }),
  );
  vi.stubEnv('CLAUDE_PROJECT_DIR', '');
  vi.stubEnv('AGENTSMESH_SESSION_ID', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(base, { recursive: true, force: true });
});

const run = async (payload: Record<string, unknown>): Promise<string> =>
  (await buildRecallHookOutput(JSON.stringify({ cwd: fakeHome.dir, ...payload }), base)).output;

describe('hook started in the home folder', () => {
  it('recalls nothing from a graph in ~/.agentsmesh', async () => {
    const out = await run({
      session_id: 'h1',
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: join(fakeHome.dir, 'notes.md') },
    });
    expect(out).toBe('');
  });

  it('writes no failure log into the home folder', async () => {
    const out = await run({
      session_id: 'h2',
      hook_event_name: 'PostToolUseFailure',
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
      error: 'Exit code 1\nboom',
    });
    expect(out).toBe('');
    expect(existsSync(lessonsPaths(fakeHome.dir).base + '/outcome-log.jsonl')).toBe(false);
  });
});
