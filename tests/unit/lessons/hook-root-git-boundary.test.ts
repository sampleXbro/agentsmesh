/**
 * The hook never reads a parent checkout's lessons from a nested git worktree
 * or submodule, and from a package of a git repo it resolves the repo root.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveLessonsGraph } from '../../../src/lessons/graph-store.js';
import { buildRecallHookOutput } from '../../../src/lessons/hook.js';
import { hookLocation } from '../../../src/lessons/hook-payload.js';
import { contextOf, graphOf } from './hook-test-helpers.js';

const RULE = 'Checkout rule for every ts file.';
const glob = { kind: 'file_glob' as const, pattern: '**/*.ts' };

let base: string;
let checkout: string;
let worktree: string;
beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), 'am-hook-git-boundary-')));
  checkout = join(base, 'checkout');
  worktree = join(checkout, '.claude', 'worktrees', 'x');
  mkdirSync(join(checkout, '.git'), { recursive: true });
  mkdirSync(join(worktree, 'src'), { recursive: true });
  writeFileSync(join(worktree, '.git'), 'gitdir: /elsewhere/.git/worktrees/x\n');
  saveLessonsGraph(checkout, graphOf({ rule: { rule: RULE, trigger: glob } }));
  vi.stubEnv('AGENTSMESH_LESSONS_TELEMETRY', '');
  vi.stubEnv('AGENTSMESH_LESSONS_OUTCOME_LOG', '0');
  vi.stubEnv('CLAUDE_PROJECT_DIR', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(base, { recursive: true, force: true });
});

const edit = async (cwd: string, file: string): Promise<string> =>
  contextOf(
    (
      await buildRecallHookOutput(
        JSON.stringify({ cwd, tool_name: 'Edit', tool_input: { file_path: file } }),
        base,
      )
    ).output,
  );

describe('hook root at a git boundary', () => {
  it('recalls the checkout lessons for a file in the checkout', async () => {
    expect(await edit(checkout, 'src/a.ts')).toContain(RULE);
  });

  it('does not recall the parent checkout lessons from a nested worktree', async () => {
    expect(await edit(worktree, 'src/a.ts')).toBe('');
    expect(await edit(worktree, join(worktree, 'src', 'a.ts'))).toBe('');
  });

  it('keeps the session project for a worktree file edited from the parent checkout', async () => {
    expect(await edit(checkout, join(worktree, 'src', 'a.ts'))).toContain(RULE);
  });

  it('roots a worktree without lessons at the worktree', () => {
    const payload = { tool_input: { file_path: 'src/a.ts' } };
    expect(hookLocation(payload, worktree).root).toBe(worktree);
    expect(hookLocation({ cwd: join(worktree, 'src') }, base).root).toBe(worktree);
  });

  it('roots a package of a git repo without lessons at the repository root', () => {
    const repo = join(base, 'bare-repo');
    const pkg = join(repo, 'packages', 'web');
    mkdirSync(join(repo, '.git'), { recursive: true });
    mkdirSync(pkg, { recursive: true });
    expect(hookLocation({ cwd: pkg }, base).root).toBe(repo);
  });
});
