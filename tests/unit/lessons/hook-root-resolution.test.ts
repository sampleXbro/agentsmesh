import { mkdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { buildRecallHookOutput } from '../../../src/lessons/hook.js';
import { contextOf, graphOf, useHookProject } from './hook-test-helpers.js';

const RULE = 'App package rule.';
const project = useHookProject(() =>
  graphOf({ app: { rule: RULE, trigger: { kind: 'file_glob', pattern: 'packages/app/src/**' } } }),
);

function subdir(): string {
  const sub = join(project.root(), 'packages', 'app');
  mkdirSync(join(sub, 'src'), { recursive: true });
  return sub;
}

async function run(payload: Record<string, unknown>, cwd: string): Promise<string> {
  return contextOf((await buildRecallHookOutput(JSON.stringify(payload), cwd)).output);
}

describe('hook resolves the lessons root when started in a subdirectory', () => {
  it('walks up from the process cwd to the project holding the graph', async () => {
    const sub = subdir();
    const abs = join(sub, 'src', 'x.ts');
    expect(await run({ tool_input: { file_path: abs } }, sub)).toContain(RULE);
  });

  it("resolves a relative file against the payload's cwd, then relativizes to the root", async () => {
    const sub = subdir();
    const ctx = await run({ cwd: sub, tool_input: { file_path: 'src/x.ts' } }, sub);
    expect(ctx).toContain(RULE);
    expect(ctx).toContain('packages/app/src/x.ts');
  });

  it("prefers the payload's cwd over the process cwd", async () => {
    const sub = subdir();
    const elsewhere = realpathSync(join(project.root(), '..'));
    expect(await run({ cwd: sub, tool_input: { file_path: 'src/x.ts' } }, elsewhere)).toContain(
      RULE,
    );
  });

  it('falls back to CLAUDE_PROJECT_DIR when the payload has no cwd', async () => {
    const sub = subdir();
    const elsewhere = realpathSync(join(project.root(), '..'));
    vi.stubEnv('CLAUDE_PROJECT_DIR', sub);
    const ctx = await run({ tool_input: { file_path: 'src/x.ts' } }, elsewhere);
    expect(ctx).toContain(RULE);
  });

  it("prefers the payload's cwd over CLAUDE_PROJECT_DIR", async () => {
    const sub = subdir();
    const other = join(project.root(), 'packages', 'other');
    mkdirSync(other, { recursive: true });
    vi.stubEnv('CLAUDE_PROJECT_DIR', other);
    const ctx = await run({ cwd: sub, tool_input: { file_path: 'src/x.ts' } }, sub);
    expect(ctx).toContain(RULE);
  });

  it('SessionStart from a subdirectory resets the same store the recall wrote', async () => {
    const sub = subdir();
    const session = project.session('root-reset');
    const edit = { session_id: session, cwd: sub, tool_input: { file_path: 'src/x.ts' } };
    expect(await run(edit, sub)).toContain(RULE);
    expect(await run(edit, sub)).toBe('');
    await run(
      { session_id: session, cwd: sub, hook_event_name: 'SessionStart', source: 'compact' },
      sub,
    );
    expect(await run(edit, sub)).toContain(RULE);
  });
});
