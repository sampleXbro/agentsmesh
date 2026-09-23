/**
 * The lessons recall hook only helps where a target feeds hook output into the
 * model. Everywhere else it is a wasted process per event (and on Copilot a
 * failing preToolUse hook even denies the tool call), so generate keeps recall
 * entries only on the target's declared `hookContextEvents`. User hooks are
 * never filtered.
 */

import { describe, expect, it } from 'vitest';
import { projectRecallHooks } from '../../../../src/targets/projection/recall-hooks.js';
import type { Hooks } from '../../../../src/core/types.js';

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

describe('projectRecallHooks', () => {
  it('keeps every entry when the target declares no context events', () => {
    const input = hooks();
    expect(projectRecallHooks(input, undefined)).toBe(input);
  });

  it('keeps recall only on context events and every user hook everywhere', () => {
    expect(projectRecallHooks(hooks(), ['SessionStart'])).toEqual({
      PreToolUse: [{ matcher: 'Bash', type: 'command', command: 'npm run guard' }],
      SessionStart: [
        { matcher: '*', type: 'command', command: RECALL },
        { matcher: '*', type: 'command', command: 'echo started' },
      ],
    });
  });

  it('drops every recall entry for a target that cannot inject context at all', () => {
    expect(projectRecallHooks(hooks(), [])).toEqual({
      PreToolUse: [{ matcher: 'Bash', type: 'command', command: 'npm run guard' }],
      SessionStart: [{ matcher: '*', type: 'command', command: 'echo started' }],
    });
  });

  it('recognises the npx-launched recall command', () => {
    expect(projectRecallHooks(hooks(), ['UserPromptSubmit'])!.UserPromptSubmit).toEqual([
      { matcher: '*', type: 'command', command: NPX_RECALL },
    ]);
  });

  it('passes null through and does not mutate its input', () => {
    expect(projectRecallHooks(null, [])).toBeNull();
    const input = hooks();
    projectRecallHooks(input, []);
    expect(input).toEqual(hooks());
  });
});
