import { describe, it, expect } from 'vitest';
import { lintHooks } from '../../../../src/targets/cursor/lint.js';
import type { CanonicalFiles } from '../../../../src/core/types.js';

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

describe('lintHooks (cursor)', () => {
  it('returns no diagnostics when hooks is null', () => {
    expect(lintHooks(makeCanonical(null))).toEqual([]);
  });

  it('returns no diagnostics when every event maps to a Cursor event', () => {
    const diags = lintHooks(
      makeCanonical({
        PreToolUse: [{ matcher: '*', type: 'command', command: 'lint' }],
        UserPromptSubmit: [{ matcher: '*', type: 'command', command: 'check' }],
      }),
    );
    expect(diags).toEqual([]);
  });

  it('warns when a canonical event has no Cursor equivalent', () => {
    const diags = lintHooks(
      makeCanonical({
        Notification: [{ matcher: '*', type: 'command', command: 'notify' }],
      }),
    );
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain('Notification');
    expect(diags[0]!.level).toBe('warning');
  });

  it('does NOT warn about PostToolUseFailure, which Cursor maps to postToolUseFailure', () => {
    const diags = lintHooks(
      makeCanonical({
        PostToolUseFailure: [
          { matcher: '*', type: 'command', command: 'agentsmesh lessons hook' },
          { matcher: '*', type: 'command', command: 'echo failed' },
        ],
      }),
    );
    expect(diags).toEqual([]);
  });
});
