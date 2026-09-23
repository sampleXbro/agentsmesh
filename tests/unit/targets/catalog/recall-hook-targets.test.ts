/**
 * `withTargetRecallHooks` resolves a target's `hookContextEvents` the same way
 * for builtins and registered plugins, so the engine can project recall hooks
 * for any target id without a builtin-only branch.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { withTargetRecallHooks } from '../../../../src/targets/catalog/recall-hook-targets.js';
import {
  getDescriptor,
  registerTargetDescriptor,
  resetRegistry,
} from '../../../../src/targets/catalog/registry.js';
import type { CanonicalFiles } from '../../../../src/core/types.js';
import type { TargetDescriptor } from '../../../../src/targets/catalog/target-descriptor.js';

const RECALL = 'agentsmesh lessons hook';

function canonical(): CanonicalFiles {
  return {
    rules: [],
    commands: [],
    agents: [],
    skills: [],
    mcp: null,
    permissions: null,
    ignore: [],
    hooks: {
      PreToolUse: [{ matcher: 'Edit', type: 'command', command: RECALL }],
      UserPromptSubmit: [{ matcher: '*', type: 'command', command: RECALL }],
      SessionStart: [{ matcher: '*', type: 'command', command: RECALL }],
      PostToolUse: [{ matcher: 'Write', type: 'command', command: 'prettier --write' }],
    },
  };
}

afterEach(() => resetRegistry());

describe('withTargetRecallHooks', () => {
  it('uses a registered plugin descriptor', async () => {
    const { descriptor } = (await import('../../../fixtures/plugins/rich-plugin/index.js')) as {
      descriptor: TargetDescriptor;
    };
    registerTargetDescriptor(descriptor);
    expect(getDescriptor('rich-plugin')?.hookContextEvents).toEqual(['SessionStart']);
    expect(withTargetRecallHooks(canonical(), 'rich-plugin').hooks).toEqual({
      SessionStart: [{ matcher: '*', type: 'command', command: RECALL }],
      PostToolUse: [{ matcher: 'Write', type: 'command', command: 'prettier --write' }],
    });
  });

  it('uses a builtin descriptor', () => {
    expect(Object.keys(withTargetRecallHooks(canonical(), 'windsurf').hooks ?? {})).toEqual([
      'PostToolUse',
    ]);
  });

  it('keeps every entry for a target that declares nothing or is unknown', () => {
    const input = canonical();
    expect(withTargetRecallHooks(input, 'claude-code')).toBe(input);
    expect(withTargetRecallHooks(input, 'no-such-target')).toBe(input);
  });
});
