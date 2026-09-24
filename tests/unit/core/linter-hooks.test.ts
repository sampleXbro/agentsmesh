import { describe, expect, it } from 'vitest';
import type { CanonicalFiles } from '../../../src/core/types.js';
import { lintHooks as lintGeminiHooks } from '../../../src/targets/gemini-cli/lint.js';
import { lintHooks as lintCopilotHooks } from '../../../src/targets/copilot/lint.js';
import { lintHooks as lintKiroHooks } from '../../../src/targets/kiro/lint.js';
import { lintHooks as lintClineHooks } from '../../../src/targets/cline/lint.js';

function makeCanonical(hooks: CanonicalFiles['hooks']): CanonicalFiles {
  return {
    rules: [],
    commands: [],
    agents: [],
    skills: [],
    mcp: null,
    permissions: null,
    hooks,
    ignore: [],
  };
}

describe('per-target lint.hooks hooks', () => {
  it('returns no diagnostics when hooks are missing', () => {
    expect(lintGeminiHooks(makeCanonical(null))).toEqual([]);
  });

  it('returns no diagnostics for supported gemini-cli events', () => {
    expect(
      lintGeminiHooks(
        makeCanonical({
          PreToolUse: [{ matcher: '*', command: 'echo pre' }],
          PostToolUse: [{ matcher: '*', command: 'echo post' }],
          Notification: [{ matcher: '*', command: 'echo note' }],
        }),
      ),
    ).toEqual([]);
  });

  it('warns for unsupported gemini-cli hook events', () => {
    const diagnostics = lintGeminiHooks(
      makeCanonical({
        SessionEnd: [{ matcher: '*', command: 'echo end' }],
      }),
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain(
      'only PreToolUse, PostToolUse, Notification, UserPromptSubmit, SubagentStart, SubagentStop, and SessionStart',
    );
  });

  it('warns for unsupported copilot hook events', () => {
    const diagnostics = lintCopilotHooks(
      makeCanonical({
        SubagentStart: [{ matcher: '*', command: 'echo start' }],
      }),
    );

    const unsupported = diagnostics.filter((d) => d.message.includes('SubagentStart'));
    expect(unsupported).toHaveLength(1);
    expect(unsupported[0]?.message).toContain('UserPromptSubmit');
  });

  it('warns for unsupported kiro hook events', () => {
    const diagnostics = lintKiroHooks(
      makeCanonical({
        Notification: [{ matcher: '*', command: 'echo note' }],
      }),
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain('Kiro hooks');
  });

  it('warns that cline emits bash wrapper scripts that need a POSIX shell on Windows', () => {
    const diagnostics = lintClineHooks(
      makeCanonical({
        PreToolUse: [{ matcher: '*', command: 'pnpm test' }],
      }),
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.target).toBe('cline');
    expect(diagnostics[0]?.level).toBe('warning');
    expect(diagnostics[0]?.message).toContain('bash');
    expect(diagnostics[0]?.message).toContain('Windows');
  });

  it('emits no cline hook diagnostics when hooks are empty', () => {
    expect(lintClineHooks(makeCanonical(null))).toEqual([]);
    expect(lintClineHooks(makeCanonical({}))).toEqual([]);
  });

  it('warns that copilot wrapper scripts need a POSIX shell on Windows when hooks are present', () => {
    const diagnostics = lintCopilotHooks(
      makeCanonical({
        PreToolUse: [{ matcher: '*', command: 'pnpm test' }],
      }),
    );

    expect(
      diagnostics.some((d) => d.message.includes('bash') && d.message.includes('Windows')),
    ).toBe(true);
  });

  it('emits no copilot windows-shell warning when hooks are empty', () => {
    const empty = lintCopilotHooks(makeCanonical(null));
    expect(empty.some((d) => d.message.includes('Windows'))).toBe(false);
  });
});
