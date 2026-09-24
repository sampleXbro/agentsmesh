/**
 * The lessons recall hook only helps where a target feeds hook output into the
 * model. Everywhere else it is a wasted process per event (and on Copilot a
 * failing preToolUse hook even denies the tool call), so generate keeps recall
 * entries only on the target's declared `hookContextEvents`. User hooks are
 * never filtered. `withTargetRecallHooks` resolves those events the same way for
 * builtins and registered plugins, so the engine needs no builtin-only branch.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { withTargetRecallHooks } from '../../../../src/targets/catalog/recall-hook-targets.js';
import {
  getDescriptor,
  registerTargetDescriptor,
  resetRegistry,
} from '../../../../src/targets/catalog/registry.js';
import type { Hooks } from '../../../../src/core/types.js';
import type { TargetDescriptor } from '../../../../src/targets/catalog/target-descriptor.js';
import { makeCanonical } from '../canonical-factory.js';

const RECALL = 'agentsmesh lessons hook';
const NPX_RECALL = 'npx --no --offline agentsmesh lessons hook';

function hooks(): Hooks {
  return {
    PreToolUse: [
      { matcher: 'Bash', type: 'command', command: 'npm run guard' },
      { matcher: 'Edit|Write', type: 'command', command: RECALL },
    ],
    UserPromptSubmit: [{ matcher: '*', type: 'command', command: NPX_RECALL }],
    PostToolUseFailure: [{ matcher: '*', type: 'command', command: RECALL }],
    SessionStart: [
      { matcher: '*', type: 'command', command: RECALL },
      { matcher: '*', type: 'command', command: 'echo started' },
    ],
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
    expect(withTargetRecallHooks(makeCanonical({ hooks: hooks() }), 'rich-plugin').hooks).toEqual({
      PreToolUse: [{ matcher: 'Bash', type: 'command', command: 'npm run guard' }],
      SessionStart: [
        { matcher: '*', type: 'command', command: RECALL },
        { matcher: '*', type: 'command', command: 'echo started' },
      ],
    });
  });

  it('drops every recall entry, bare or npx-launched, for a builtin that cannot inject context', () => {
    expect(withTargetRecallHooks(makeCanonical({ hooks: hooks() }), 'windsurf').hooks).toEqual({
      PreToolUse: [{ matcher: 'Bash', type: 'command', command: 'npm run guard' }],
      SessionStart: [{ matcher: '*', type: 'command', command: 'echo started' }],
    });
  });

  it('keeps the npx-launched recall command on a context event', () => {
    expect(
      withTargetRecallHooks(makeCanonical({ hooks: hooks() }), 'gemini-cli').hooks
        ?.UserPromptSubmit,
    ).toEqual([{ matcher: '*', type: 'command', command: NPX_RECALL }]);
  });

  it('keeps every entry for a target that declares nothing or is unknown', () => {
    const input = makeCanonical({ hooks: hooks() });
    expect(withTargetRecallHooks(input, 'claude-code')).toBe(input);
    expect(withTargetRecallHooks(input, 'no-such-target')).toBe(input);
  });

  it('passes null hooks through and does not mutate its input', () => {
    const empty = makeCanonical();
    expect(withTargetRecallHooks(empty, 'windsurf')).toBe(empty);
    const input = makeCanonical({ hooks: hooks() });
    withTargetRecallHooks(input, 'windsurf');
    expect(input.hooks).toEqual(hooks());
  });
});
