import { describe, expect, it } from 'vitest';
import { count, graphOf, useHookProject } from './hook-test-helpers.js';

const MIG = 'Never edit an applied migration.';
const SRC = 'Keep src modules under 200 lines.';
const KW = 'Guard every regex against redos.';
const CMD = 'Command rule that must not fire on patch text.';

const project = useHookProject(() =>
  graphOf({
    mig: { rule: MIG, trigger: { kind: 'file_glob', pattern: 'db/migrations/**' } },
    src: { rule: SRC, trigger: { kind: 'file_glob', pattern: 'src/**' } },
    kw: { rule: KW, trigger: { kind: 'keyword', pattern: 'redos' } },
    cmd: { rule: CMD, trigger: { kind: 'command_pattern', pattern: 'Patch' } },
  }),
);

const patch = (...body: string[]): string =>
  ['*** Begin Patch', ...body, '*** End Patch'].join('\n');

const run = project.recall;

describe('hook recall for Codex apply_patch edits', () => {
  it('recalls file lessons for a patch carried in tool_input.command', async () => {
    const ctx = await run({
      hook_event_name: 'PreToolUse',
      tool_name: 'apply_patch',
      tool_input: { command: patch('*** Update File: db/migrations/001.sql', '@@', '-a', '+b') },
    });
    expect(ctx).toContain(MIG);
    expect(ctx).toContain('db/migrations/001.sql');
    expect(ctx).not.toContain(CMD);
  });

  it('recalls for every path in the patch, each lesson once', async () => {
    const ctx = await run({
      tool_name: 'apply_patch',
      tool_input: {
        command: patch(
          '*** Update File: db/migrations/001.sql',
          '+x',
          '*** Add File: src/new.ts',
          '+y',
          '*** Update File: src/other.ts',
          '+z',
        ),
      },
    });
    expect(count(ctx, MIG)).toBe(1);
    expect(count(ctx, SRC)).toBe(1);
  });

  it('reads the patch from tool_input.patch', async () => {
    const ctx = await run({
      tool_name: 'apply_patch',
      tool_input: { patch: patch('*** Delete File: db/migrations/002.sql') },
    });
    expect(ctx).toContain(MIG);
  });

  it('recalls for the Move-to destination', async () => {
    const ctx = await run({
      tool_name: 'apply_patch',
      tool_input: { command: patch('*** Update File: docs/a.md', '*** Move to: src/a.ts', '+m') },
    });
    expect(ctx).toContain(SRC);
  });

  it('handles a patch sent under an Edit alias', async () => {
    const ctx = await run({
      tool_name: 'Edit',
      tool_input: { command: patch('*** Update File: src/x.ts', '+k') },
    });
    expect(ctx).toContain(SRC);
    expect(ctx).not.toContain(CMD);
  });

  it('feeds added lines into diff-aware keyword recall', async () => {
    const ctx = await run({
      tool_name: 'apply_patch',
      tool_input: {
        command: patch('*** Update File: docs/readme.md', '+we must avoid redos here'),
      },
    });
    expect(ctx).toContain(KW);
  });

  it('records a failed patch against its first path, not as a shell command', async () => {
    const ctx = await run({
      hook_event_name: 'PostToolUseFailure',
      tool_name: 'apply_patch',
      tool_input: { command: patch('*** Update File: src/x.ts', '+k') },
      tool_error: 'patch did not apply',
    });
    expect(ctx).toContain("--trigger-file 'src/x.ts'");
    expect(ctx).not.toContain('--trigger-cmd');
  });
});
