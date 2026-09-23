/**
 * Windsurf hooks report back only through exit codes; stdout goes to the Cascade
 * UI and only an exit-2 stderr reaches the agent, while blocking the action
 * (docs.windsurf.com/windsurf/cascade/hooks). No event injects context, so the
 * lessons recall hook is never generated here. User hooks still are.
 */

import { describe, expect, it } from 'vitest';
// Catalog first: entering the circular target graph from a target index leaves
// its BUILTIN_TARGETS slot undefined.
import { withTargetRecallHooks } from '../../../../src/targets/catalog/recall-hook-targets.js';
import { descriptor } from '../../../../src/targets/windsurf/index.js';
import { generateHooks } from '../../../../src/targets/windsurf/generator.js';
import { WINDSURF_HOOKS_FILE } from '../../../../src/targets/windsurf/constants.js';
import type { CanonicalFiles, Hooks } from '../../../../src/core/types.js';
import { makeCanonical } from '../canonical-factory.js';

const RECALL = 'agentsmesh lessons hook';

function canonical(hooks: Hooks): CanonicalFiles {
  return withTargetRecallHooks(makeCanonical({ hooks }), 'windsurf');
}

const recallEverywhere: Hooks = {
  PreToolUse: [{ matcher: 'Edit|Write', type: 'command', command: RECALL }],
  UserPromptSubmit: [{ matcher: '*', type: 'command', command: RECALL }],
  PostToolUseFailure: [{ matcher: '*', type: 'command', command: RECALL }],
  SessionStart: [{ matcher: '*', type: 'command', command: `npx --no --offline ${RECALL}` }],
};

describe('windsurf lessons recall hooks', () => {
  it('declares that no Windsurf hook event injects context', () => {
    expect(descriptor.hookContextEvents).toEqual([]);
  });

  it('generates no hooks file when the recall hook is the only hook', () => {
    expect(generateHooks(canonical(recallEverywhere))).toEqual([]);
  });

  it('keeps user hooks and drops only the recall entries', () => {
    const results = generateHooks(
      canonical({
        ...recallEverywhere,
        PreToolUse: [
          { matcher: 'Edit|Write', type: 'command', command: RECALL },
          { matcher: '*', type: 'command', command: 'echo pre' },
        ],
      }),
    );
    expect(results).toEqual([
      {
        path: WINDSURF_HOOKS_FILE,
        content: JSON.stringify(
          { hooks: { pre_tool_use: [{ command: 'echo pre', show_output: true }] } },
          null,
          2,
        ),
      },
    ]);
  });
});
