/**
 * The hook takes the lessons project from the touched file first, then from
 * the payload cwd: from a monorepo root, a package's own lessons apply to its
 * files, and a payload cwd outside the project no longer hides the project of
 * an absolute file path inside it.
 */

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveLessonsGraph } from '../../../src/lessons/graph-store.js';
import { buildRecallHookOutput } from '../../../src/lessons/hook.js';
import { contextOf, graphOf } from './hook-test-helpers.js';

let base: string;
let repo: string;
let pkg: string;
const ROOT_RULE = 'Root rule for every source file.';
const PKG_RULE = 'Package rule for its own source.';

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'am-hook-root-file-'));
  repo = join(base, 'repo');
  pkg = join(repo, 'packages', 'a');
  mkdirSync(join(pkg, 'src'), { recursive: true });
  mkdirSync(join(base, 'elsewhere'), { recursive: true });
  const glob = { kind: 'file_glob' as const, pattern: '**/*.ts' };
  saveLessonsGraph(repo, graphOf({ root: { rule: ROOT_RULE, trigger: glob } }));
  saveLessonsGraph(pkg, graphOf({ pkg: { rule: PKG_RULE, trigger: glob } }));
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
        JSON.stringify({
          hook_event_name: 'PreToolUse',
          cwd,
          tool_name: 'Edit',
          tool_input: { file_path: file },
        }),
        base,
      )
    ).output,
  );

describe('hook project root', () => {
  it("uses a package's own lessons for its files, from the monorepo root", async () => {
    const ctx = await edit(repo, 'packages/a/src/x.ts');
    expect(ctx).toContain(PKG_RULE);
    expect(ctx).not.toContain(ROOT_RULE);
  });

  it('uses the root lessons for a root file', async () => {
    const ctx = await edit(repo, 'src/y.ts');
    expect(ctx).toContain(ROOT_RULE);
    expect(ctx).not.toContain(PKG_RULE);
  });

  it('finds the project of an absolute file even when the cwd is outside it', async () => {
    vi.stubEnv('CLAUDE_PROJECT_DIR', repo);
    const ctx = await edit(join(base, 'elsewhere'), join(pkg, 'src', 'x.ts'));
    expect(ctx).toContain(PKG_RULE);
  });
});
