/**
 * Cursor feeds hook output to the model only as `additional_context` on
 * sessionStart, postToolUse and postToolUseFailure. preToolUse output is
 * permission/user_message/agent_message/updated_input, and beforeSubmitPrompt
 * output is continue/user_message (cursor.com/docs/agent/hooks). So the lessons
 * recall hook rides only the injecting events; user hooks are unchanged.
 */

import { describe, expect, it } from 'vitest';
// Catalog first: entering the circular target graph from a target index leaves
// its BUILTIN_TARGETS slot undefined.
import { withTargetRecallHooks } from '../../../../src/targets/catalog/recall-hook-targets.js';
import { descriptor } from '../../../../src/targets/cursor/index.js';
import { generateHooks } from '../../../../src/targets/cursor/generator.js';
import {
  cursorHooksToCanonical,
  unmappedCursorHookEvents,
} from '../../../../src/targets/cursor/hook-format.js';
import { CURSOR_HOOKS } from '../../../../src/targets/cursor/constants.js';
import type { CanonicalFiles, Hooks } from '../../../../src/core/types.js';
import { makeCanonical } from '../canonical-factory.js';

const RECALL = 'npx --no --offline agentsmesh lessons hook';

function canonical(hooks: Hooks): CanonicalFiles {
  return withTargetRecallHooks(makeCanonical({ hooks }), 'cursor');
}

describe('cursor lessons recall hooks', () => {
  it('declares the events whose output Cursor injects into the conversation', () => {
    expect(descriptor.hookContextEvents).toEqual([
      'SessionStart',
      'PostToolUse',
      'PostToolUseFailure',
    ]);
  });

  it('keeps recall on sessionStart and postToolUseFailure only, and every user hook', () => {
    const results = generateHooks(
      canonical({
        PreToolUse: [
          { matcher: 'Edit|Write|NotebookEdit|Bash|PowerShell', type: 'command', command: RECALL },
          { matcher: 'Shell', type: 'command', command: './guard.sh' },
        ],
        UserPromptSubmit: [{ matcher: '*', type: 'command', command: RECALL }],
        PostToolUseFailure: [{ matcher: '*', type: 'command', command: RECALL }],
        SessionStart: [{ matcher: '*', type: 'command', command: RECALL }],
      }),
    );
    expect(results).toEqual([
      {
        path: CURSOR_HOOKS,
        content: JSON.stringify(
          {
            version: 1,
            hooks: {
              preToolUse: [{ type: 'command', command: './guard.sh', matcher: 'Shell' }],
              postToolUseFailure: [{ type: 'command', command: RECALL, matcher: '*' }],
              sessionStart: [{ type: 'command', command: RECALL, matcher: '*' }],
            },
          },
          null,
          2,
        ),
      },
    ]);
  });

  it('maps PostToolUseFailure both ways, so user failure hooks are no longer dropped', () => {
    const hooks: Hooks = {
      PostToolUseFailure: [{ matcher: 'Shell', type: 'command', command: './on-fail.sh' }],
    };
    expect(unmappedCursorHookEvents(hooks)).toEqual([]);
    const content = JSON.parse(generateHooks(canonical(hooks))[0]!.content) as {
      hooks: Record<string, unknown>;
    };
    expect(content.hooks).toEqual({
      postToolUseFailure: [{ type: 'command', command: './on-fail.sh', matcher: 'Shell' }],
    });
    expect(cursorHooksToCanonical(content.hooks)).toEqual(hooks);
  });
});
