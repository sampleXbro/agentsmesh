/**
 * Gemini CLI reads `hookSpecificOutput.additionalContext` on BeforeAgent (the
 * prompt event), AfterTool and SessionStart; BeforeTool output has no
 * additionalContext (geminicli.com/docs/hooks/reference). So the lessons recall
 * hook rides UserPromptSubmit -> BeforeAgent and SessionStart, never
 * BeforeTool. Tool matchers use Gemini tool names, so canonical names are
 * translated on generate and back on import.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getBuiltinTargetDefinition } from '../../../../src/targets/catalog/builtin-targets.js';
import { generateGeminiSettingsFiles } from '../../../../src/targets/gemini-cli/generator.js';
import { importFromGemini } from '../../../../src/targets/gemini-cli/importer.js';
import { lintHooks } from '../../../../src/targets/gemini-cli/lint.js';
import { GEMINI_SETTINGS } from '../../../../src/targets/gemini-cli/constants.js';
import type { CanonicalFiles, Hooks } from '../../../../src/core/types.js';

const RECALL = 'agentsmesh lessons hook';
const HOOKS_ONLY = new Set(['hooks']);

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

function settingsHooks(hooks: Hooks): unknown {
  const [out] = generateGeminiSettingsFiles(canonical(hooks), HOOKS_ONLY);
  return (JSON.parse(out!.content) as { hooks: unknown }).hooks;
}

describe('gemini-cli lessons recall hooks', () => {
  it('declares the canonical events whose output Gemini adds to the model context', () => {
    expect(getBuiltinTargetDefinition('gemini-cli')?.hookContextEvents).toEqual([
      'UserPromptSubmit',
      'SessionStart',
      'PostToolUse',
    ]);
  });

  it('rides BeforeAgent and SessionStart, never BeforeTool, and translates tool matchers', () => {
    expect(
      settingsHooks({
        PreToolUse: [
          { matcher: 'Edit|Write|NotebookEdit|Bash|PowerShell', type: 'command', command: RECALL },
          { matcher: 'Edit|Write|Bash', type: 'command', command: './guard.sh' },
        ],
        UserPromptSubmit: [{ matcher: '*', type: 'command', command: RECALL }],
        PostToolUseFailure: [{ matcher: '*', type: 'command', command: RECALL }],
        SessionStart: [{ matcher: '*', type: 'command', command: RECALL }],
      }),
    ).toEqual({
      BeforeTool: [
        {
          matcher: '^(?:replace|write_file|run_shell_command)$',
          hooks: [{ name: 'BeforeTool-1', type: 'command', command: './guard.sh' }],
        },
      ],
      BeforeAgent: [
        { matcher: '*', hooks: [{ name: 'BeforeAgent-1', type: 'command', command: RECALL }] },
      ],
      SessionStart: [
        { matcher: '*', hooks: [{ name: 'SessionStart-1', type: 'command', command: RECALL }] },
      ],
    });
  });

  it('merges every canonical event that lands on BeforeAgent with unique names', () => {
    expect(
      settingsHooks({
        UserPromptSubmit: [{ matcher: '*', type: 'command', command: 'echo prompt' }],
        SubagentStart: [{ matcher: '*', type: 'command', command: 'echo agent' }],
      }),
    ).toEqual({
      BeforeAgent: [
        {
          matcher: '*',
          hooks: [{ name: 'BeforeAgent-1', type: 'command', command: 'echo prompt' }],
        },
        {
          matcher: '*',
          hooks: [{ name: 'BeforeAgent-2', type: 'command', command: 'echo agent' }],
        },
      ],
    });
  });

  it('no longer warns about a user UserPromptSubmit hook', () => {
    expect(
      lintHooks(canonical({ UserPromptSubmit: [{ matcher: '*', type: 'command', command: 'x' }] })),
    ).toEqual([]);
  });
});

describe('gemini-cli hook import', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'am-gemini-recall-'));
    mkdirSync(join(root, '.gemini'), { recursive: true });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('imports BeforeAgent as UserPromptSubmit and tool matchers as canonical names', async () => {
    writeFileSync(
      join(root, GEMINI_SETTINGS),
      JSON.stringify({
        hooks: {
          BeforeTool: [
            {
              matcher: '^(?:replace|write_file|run_shell_command)$',
              hooks: [{ type: 'command', command: './guard.sh' }],
            },
            { matcher: 'mcp_.*', hooks: [{ type: 'command', command: './mcp.sh' }] },
          ],
          BeforeAgent: [{ matcher: '*', hooks: [{ type: 'command', command: RECALL }] }],
        },
      }),
    );
    await importFromGemini(root);
    const hooks = parseYaml(readFileSync(join(root, '.agentsmesh', 'hooks.yaml'), 'utf8')) as Hooks;
    expect(hooks).toEqual({
      PreToolUse: [
        { matcher: 'Edit|Write|Bash', command: './guard.sh', type: 'command' },
        { matcher: 'mcp_.*', command: './mcp.sh', type: 'command' },
      ],
      UserPromptSubmit: [{ matcher: '*', command: RECALL, type: 'command' }],
    });
  });
});
