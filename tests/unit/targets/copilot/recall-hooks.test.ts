/**
 * Copilot config-file hooks: preToolUse output is only permissionDecision /
 * permissionDecisionReason / modifiedArgs (and a failing command preToolUse
 * hook DENIES the tool call), userPromptSubmitted output is dropped, while
 * sessionStart, postToolUse and postToolUseFailure can return additionalContext
 * (docs.github.com/en/copilot/reference/hooks-configuration). The lessons
 * recall hook rides only those. Every wrapper script is referenced by the
 * hooks config, and every reference has a script.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { descriptor } from '../../../../src/targets/copilot/index.js';
import { generateHooks } from '../../../../src/targets/copilot/generator.js';
import { generateCopilotGlobalHooks } from '../../../../src/targets/copilot/global-hooks.js';
import { mapCopilotHookEvent } from '../../../../src/targets/copilot/hook-parser.js';
import { lintHooks } from '../../../../src/targets/copilot/lint.js';
import type { CanonicalFiles, Hooks } from '../../../../src/core/types.js';

const RECALL = 'agentsmesh lessons hook';

function canonical(hooks: Hooks): CanonicalFiles {
  return {
    rules: [],
    commands: [],
    agents: [],
    skills: [],
    mcp: null,
    permissions: null,
    ignore: [],
    hooks,
  };
}

const HOOKS: Hooks = {
  PreToolUse: [
    { matcher: 'Edit|Write|NotebookEdit|Bash|PowerShell', type: 'command', command: RECALL },
    { matcher: 'bash', type: 'command', command: './guard.sh' },
  ],
  UserPromptSubmit: [{ matcher: '*', type: 'command', command: RECALL }],
  PostToolUseFailure: [{ matcher: '*', type: 'command', command: RECALL }],
  SessionStart: [{ matcher: '*', type: 'command', command: RECALL }],
  SubagentStop: [{ matcher: '*', type: 'command', command: 'echo done' }],
};

const CONFIG = {
  version: 1,
  hooks: {
    preToolUse: [{ type: 'command', bash: './scripts/pretooluse-0.sh', matcher: 'bash' }],
    postToolUseFailure: [{ type: 'command', bash: './scripts/posttoolusefailure-0.sh' }],
    sessionStart: [{ type: 'command', bash: './scripts/sessionstart-0.sh' }],
  },
};
const SCRIPTS = ['pretooluse-0.sh', 'posttoolusefailure-0.sh', 'sessionstart-0.sh'];

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'am-copilot-recall-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('copilot lessons recall hooks', () => {
  it('declares the events whose output Copilot adds to the model context', () => {
    expect(descriptor.hookContextEvents).toEqual([
      'SessionStart',
      'PostToolUse',
      'PostToolUseFailure',
    ]);
  });

  it('project scope: config and wrapper scripts match exactly, recall only where it injects', async () => {
    const outputs = await descriptor.postProcessHookOutputs!(
      root,
      canonical(HOOKS),
      generateHooks(canonical(HOOKS)),
    );
    expect(outputs.map((o) => o.path)).toEqual([
      '.github/hooks/agentsmesh.json',
      ...SCRIPTS.map((s) => `.github/hooks/scripts/${s}`),
    ]);
    expect(JSON.parse(outputs[0]!.content)).toEqual(CONFIG);
    const scripts = new Map(outputs.map((o) => [o.path, o.content]));
    expect(scripts.get('.github/hooks/scripts/pretooluse-0.sh')).toContain('\n./guard.sh\n');
    expect(scripts.get('.github/hooks/scripts/sessionstart-0.sh')).toContain(`\n${RECALL}\n`);
    expect(scripts.get('.github/hooks/scripts/posttoolusefailure-0.sh')).toContain(`\n${RECALL}\n`);
  });

  it('global scope: the same config and script set under .copilot/hooks', async () => {
    const results = await generateCopilotGlobalHooks(canonical(HOOKS), root);
    expect(results.map((r) => r.path)).toEqual([
      '.copilot/hooks/agentsmesh.json',
      ...SCRIPTS.map((s) => `.copilot/hooks/scripts/${s}`),
    ]);
    expect(JSON.parse(results[0]!.content)).toEqual(CONFIG);
  });

  it('writes no wrapper for an event Copilot cannot represent', async () => {
    const hooks: Hooks = { SubagentStop: [{ matcher: '*', type: 'command', command: 'echo' }] };
    expect(generateHooks(canonical(hooks))).toEqual([]);
    await expect(descriptor.postProcessHookOutputs!(root, canonical(hooks), [])).resolves.toEqual(
      [],
    );
  });

  it('imports sessionStart and postToolUseFailure back to canonical events', () => {
    expect(mapCopilotHookEvent('sessionStart')).toBe('SessionStart');
    expect(mapCopilotHookEvent('postToolUseFailure')).toBe('PostToolUseFailure');
  });

  it('does not warn about user SessionStart or PostToolUseFailure hooks', () => {
    const diags = lintHooks(
      canonical({
        SessionStart: [{ matcher: '*', type: 'command', command: 'echo hi' }],
        PostToolUseFailure: [{ matcher: '*', type: 'command', command: 'echo failed' }],
      }),
    );
    expect(diags.map((d) => d.message)).toEqual([
      'copilot hooks are emitted as .github/hooks/scripts/*.sh wrapper scripts with a `#!/usr/bin/env bash` header; they require a POSIX shell (git-bash or WSL) to execute on Windows.',
    ]);
  });
});
