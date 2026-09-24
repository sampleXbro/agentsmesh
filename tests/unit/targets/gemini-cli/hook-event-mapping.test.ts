/**
 * Tests for the extended Gemini CLI hook event mapping.
 *
 * Gemini CLI supports 11 hook events in settingsSchema.ts:
 *   BeforeTool, AfterTool, BeforeAgent, AfterAgent, Notification,
 *   SessionStart, SessionEnd, PreCompress, BeforeModel, AfterModel, BeforeToolSelection
 *
 * agentsmesh canonical events: PreToolUse, PostToolUse, Notification,
 *   SubagentStart, SubagentStop, SessionStart (BEST_EFFORT), UserPromptSubmit, PostToolUseFailure
 *
 * Wired bidirectional mappings (generator canonical->gemini, importer gemini->canonical):
 *   PreToolUse       <-> BeforeTool
 *   PostToolUse      <-> AfterTool
 *   Notification     <-> Notification
 *   UserPromptSubmit <-> BeforeAgent (fires after the user submits a prompt)
 *   SubagentStart     -> BeforeAgent (generate only; kept for existing hooks)
 *   SubagentStop     <-> AfterAgent
 *   SessionStart     <-> SessionStart
 *
 * Gemini-only events (SessionEnd, PreCompress, BeforeModel, AfterModel,
 * BeforeToolSelection) have no canonical equivalent and remain unmapped.
 */

import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mapGeminiHookEvent } from '../../../../src/targets/gemini-cli/hook-map.js';
import { generateGeminiSettingsFiles } from '../../../../src/targets/gemini-cli/generator.js';
import { lintHooks } from '../../../../src/targets/gemini-cli/lint.js';
import { importFromGemini } from '../../../../src/targets/gemini-cli/importer.js';
import { GEMINI_SETTINGS } from '../../../../src/targets/gemini-cli/constants.js';
import type { CanonicalFiles } from '../../../../src/core/types.js';

const ALL_FEATURES = new Set([
  'rules',
  'commands',
  'agents',
  'skills',
  'mcp',
  'hooks',
  'ignore',
  'permissions',
]);

function makeCanonical(overrides: Partial<CanonicalFiles> = {}): CanonicalFiles {
  return {
    rules: [],
    commands: [],
    agents: [],
    skills: [],
    mcp: null,
    permissions: null,
    hooks: null,
    ignore: [],
    ...overrides,
  };
}

const TEST_DIR = join(tmpdir(), 'am-gemini-hook-event-mapping-test');

beforeEach(() => mkdirSync(TEST_DIR, { recursive: true }));
afterEach(() => rmSync(TEST_DIR, { recursive: true, force: true }));

// ---------------------------------------------------------------------------
// mapGeminiHookEvent — importer direction (Gemini event -> canonical event)
// ---------------------------------------------------------------------------

describe('mapGeminiHookEvent — extended event support', () => {
  it('maps BeforeAgent to UserPromptSubmit', () => {
    expect(mapGeminiHookEvent('BeforeAgent')).toBe('UserPromptSubmit');
  });

  it('maps AfterAgent to SubagentStop', () => {
    expect(mapGeminiHookEvent('AfterAgent')).toBe('SubagentStop');
  });

  it('maps SessionStart to SessionStart', () => {
    expect(mapGeminiHookEvent('SessionStart')).toBe('SessionStart');
  });

  it('returns null for Gemini-only events with no canonical equivalent', () => {
    expect(mapGeminiHookEvent('SessionEnd')).toBeNull();
    expect(mapGeminiHookEvent('PreCompress')).toBeNull();
    expect(mapGeminiHookEvent('BeforeModel')).toBeNull();
    expect(mapGeminiHookEvent('AfterModel')).toBeNull();
    expect(mapGeminiHookEvent('BeforeToolSelection')).toBeNull();
  });

  it('still maps the original 3 events correctly', () => {
    expect(mapGeminiHookEvent('BeforeTool')).toBe('PreToolUse');
    expect(mapGeminiHookEvent('AfterTool')).toBe('PostToolUse');
    expect(mapGeminiHookEvent('Notification')).toBe('Notification');
    expect(mapGeminiHookEvent('preToolUse')).toBe('PreToolUse');
    expect(mapGeminiHookEvent('postToolUse')).toBe('PostToolUse');
    expect(mapGeminiHookEvent('notification')).toBe('Notification');
  });
});

// ---------------------------------------------------------------------------
// generateGeminiSettingsFiles — generator direction (canonical -> Gemini)
// ---------------------------------------------------------------------------

describe('generateGeminiSettingsFiles — extended hook event mapping', () => {
  it('maps SubagentStart to BeforeAgent in settings.json', () => {
    const canonical = makeCanonical({
      hooks: {
        SubagentStart: [{ matcher: '*', command: 'echo start', type: 'command' }],
      },
    });
    const results = generateGeminiSettingsFiles(canonical, ALL_FEATURES);
    expect(results).toHaveLength(1);
    const parsed = JSON.parse(results[0]!.content) as Record<string, unknown>;
    const hooks = parsed.hooks as Record<string, unknown>;
    expect(hooks.BeforeAgent).toBeDefined();
    expect(hooks.SubagentStart).toBeUndefined();
  });

  it('maps SubagentStop to AfterAgent in settings.json', () => {
    const canonical = makeCanonical({
      hooks: {
        SubagentStop: [{ matcher: '*', command: 'echo stop', type: 'command' }],
      },
    });
    const results = generateGeminiSettingsFiles(canonical, ALL_FEATURES);
    expect(results).toHaveLength(1);
    const parsed = JSON.parse(results[0]!.content) as Record<string, unknown>;
    const hooks = parsed.hooks as Record<string, unknown>;
    expect(hooks.AfterAgent).toBeDefined();
    expect(hooks.SubagentStop).toBeUndefined();
  });

  it('maps SessionStart to SessionStart in settings.json', () => {
    const canonical = makeCanonical({
      hooks: {
        SessionStart: [{ matcher: '*', command: 'echo session', type: 'command' }],
      },
    });
    const results = generateGeminiSettingsFiles(canonical, ALL_FEATURES);
    expect(results).toHaveLength(1);
    const parsed = JSON.parse(results[0]!.content) as Record<string, unknown>;
    const hooks = parsed.hooks as Record<string, unknown>;
    expect(hooks.SessionStart).toBeDefined();
  });

  it('maps all 6 supported events in a single canonical hooks object', () => {
    const canonical = makeCanonical({
      hooks: {
        PreToolUse: [{ matcher: 'Read', command: 'echo pre', type: 'command' }],
        PostToolUse: [{ matcher: 'Write', command: 'echo post', type: 'command' }],
        Notification: [{ matcher: '.*', command: 'echo notify', type: 'command' }],
        SubagentStart: [{ matcher: '*', command: 'echo agent-start', type: 'command' }],
        SubagentStop: [{ matcher: '*', command: 'echo agent-stop', type: 'command' }],
        SessionStart: [{ matcher: '*', command: 'echo session', type: 'command' }],
      },
    });
    const results = generateGeminiSettingsFiles(canonical, ALL_FEATURES);
    expect(results).toHaveLength(1);
    const parsed = JSON.parse(results[0]!.content) as Record<string, unknown>;
    const hooks = parsed.hooks as Record<string, unknown>;
    // All 6 canonical events must appear as their Gemini equivalents
    expect(hooks.BeforeTool).toBeDefined();
    expect(hooks.AfterTool).toBeDefined();
    expect(hooks.Notification).toBeDefined();
    expect(hooks.BeforeAgent).toBeDefined();
    expect(hooks.AfterAgent).toBeDefined();
    expect(hooks.SessionStart).toBeDefined();
    // No canonical names leak through
    expect(hooks.PreToolUse).toBeUndefined();
    expect(hooks.PostToolUse).toBeUndefined();
    expect(hooks.SubagentStart).toBeUndefined();
    expect(hooks.SubagentStop).toBeUndefined();
  });

  it('exact hook entry count is preserved across all 6 events', () => {
    const canonical = makeCanonical({
      hooks: {
        PreToolUse: [
          { matcher: 'Read', command: 'echo pre-1', type: 'command' },
          { matcher: 'Write', command: 'echo pre-2', type: 'command' },
        ],
        SubagentStart: [{ matcher: '*', command: 'echo agent', type: 'command' }],
      },
    });
    const results = generateGeminiSettingsFiles(canonical, ALL_FEATURES);
    expect(results).toHaveLength(1);
    const parsed = JSON.parse(results[0]!.content) as Record<string, unknown>;
    const hooks = parsed.hooks as Record<string, unknown>;
    expect((hooks.BeforeTool as unknown[]).length).toBe(2);
    expect((hooks.BeforeAgent as unknown[]).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// lintHooks — extended supported events (no spurious warnings for new events)
// ---------------------------------------------------------------------------

describe('lintHooks — extended supported events', () => {
  it('does not warn for SubagentStart (now supported)', () => {
    const canonical = makeCanonical({
      hooks: {
        SubagentStart: [{ matcher: '*', command: 'echo start', type: 'command' }],
      },
    });
    const diags = lintHooks(canonical);
    expect(diags).toHaveLength(0);
  });

  it('does not warn for SubagentStop (now supported)', () => {
    const canonical = makeCanonical({
      hooks: {
        SubagentStop: [{ matcher: '*', command: 'echo stop', type: 'command' }],
      },
    });
    const diags = lintHooks(canonical);
    expect(diags).toHaveLength(0);
  });

  it('does not warn for SessionStart (BEST_EFFORT event — always exempt from warnings)', () => {
    const canonical = makeCanonical({
      hooks: {
        SessionStart: [{ matcher: '*', command: 'echo session', type: 'command' }],
      },
    });
    const diags = lintHooks(canonical);
    expect(diags).toHaveLength(0);
  });

  it('warns once for a user-authored PostToolUseFailure hook (Gemini has no such event)', () => {
    const canonical = makeCanonical({
      hooks: {
        PostToolUseFailure: [{ matcher: '*', command: 'echo failed', type: 'command' }],
        UserPromptSubmit: [{ matcher: '*', command: 'echo prompt', type: 'command' }],
      },
    });
    const diags = lintHooks(canonical);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain('PostToolUseFailure is not supported by gemini-cli');
  });

  it('stays silent for the agentsmesh-injected UserPromptSubmit recall hook', () => {
    const canonical = makeCanonical({
      hooks: {
        UserPromptSubmit: [{ matcher: '*', command: 'agentsmesh lessons hook', type: 'command' }],
      },
    });
    expect(lintHooks(canonical)).toHaveLength(0);
  });

  it('returns no diagnostics when all hooks are supported or BEST_EFFORT', () => {
    const canonical = makeCanonical({
      hooks: {
        PreToolUse: [{ matcher: '*', command: 'echo', type: 'command' }],
        PostToolUse: [{ matcher: '*', command: 'echo', type: 'command' }],
        Notification: [{ matcher: '*', command: 'echo', type: 'command' }],
        SubagentStart: [{ matcher: '*', command: 'echo', type: 'command' }],
        SubagentStop: [{ matcher: '*', command: 'echo', type: 'command' }],
        SessionStart: [{ matcher: '*', command: 'echo', type: 'command' }],
        PostToolUseFailure: [{ matcher: '*', command: 'agentsmesh lessons hook', type: 'command' }],
      },
    });
    const diags = lintHooks(canonical);
    expect(diags).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// importFromGemini — importer direction (Gemini settings.json -> canonical hooks.yaml)
// ---------------------------------------------------------------------------

describe('importFromGemini — extended hook event import', () => {
  it('imports BeforeAgent as UserPromptSubmit', async () => {
    mkdirSync(join(TEST_DIR, '.gemini'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, GEMINI_SETTINGS),
      JSON.stringify({
        hooks: {
          BeforeAgent: [
            { matcher: '*', hooks: [{ type: 'command', command: 'echo agent-start' }] },
          ],
        },
      }),
    );
    const results = await importFromGemini(TEST_DIR);
    const hooksResult = results.find((r) => r.toPath === '.agentsmesh/hooks.yaml');
    expect(hooksResult).toBeDefined();
    const content = readFileSync(join(TEST_DIR, '.agentsmesh', 'hooks.yaml'), 'utf-8');
    expect(content).toContain('UserPromptSubmit');
    expect(content).not.toContain('SubagentStart');
    expect(content).toContain('echo agent-start');
    expect(content).not.toContain('BeforeAgent');
  });

  it('imports AfterAgent as SubagentStop', async () => {
    mkdirSync(join(TEST_DIR, '.gemini'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, GEMINI_SETTINGS),
      JSON.stringify({
        hooks: {
          AfterAgent: [{ matcher: '*', hooks: [{ type: 'command', command: 'echo agent-stop' }] }],
        },
      }),
    );
    const results = await importFromGemini(TEST_DIR);
    const hooksResult = results.find((r) => r.toPath === '.agentsmesh/hooks.yaml');
    expect(hooksResult).toBeDefined();
    const content = readFileSync(join(TEST_DIR, '.agentsmesh', 'hooks.yaml'), 'utf-8');
    expect(content).toContain('SubagentStop');
    expect(content).toContain('echo agent-stop');
    expect(content).not.toContain('AfterAgent');
  });

  it('imports SessionStart as SessionStart', async () => {
    mkdirSync(join(TEST_DIR, '.gemini'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, GEMINI_SETTINGS),
      JSON.stringify({
        hooks: {
          SessionStart: [{ matcher: '*', hooks: [{ type: 'command', command: 'echo session' }] }],
        },
      }),
    );
    const results = await importFromGemini(TEST_DIR);
    const hooksResult = results.find((r) => r.toPath === '.agentsmesh/hooks.yaml');
    expect(hooksResult).toBeDefined();
    const content = readFileSync(join(TEST_DIR, '.agentsmesh', 'hooks.yaml'), 'utf-8');
    expect(content).toContain('SessionStart');
    expect(content).toContain('echo session');
  });

  it('ignores Gemini-only events (SessionEnd, PreCompress, BeforeModel, AfterModel, BeforeToolSelection)', async () => {
    mkdirSync(join(TEST_DIR, '.gemini'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, GEMINI_SETTINGS),
      JSON.stringify({
        hooks: {
          SessionEnd: [{ matcher: '*', hooks: [{ type: 'command', command: 'echo end' }] }],
          PreCompress: [{ matcher: '*', hooks: [{ type: 'command', command: 'echo compress' }] }],
          BeforeModel: [{ matcher: '*', hooks: [{ type: 'command', command: 'echo model' }] }],
          AfterModel: [{ matcher: '*', hooks: [{ type: 'command', command: 'echo after-model' }] }],
          BeforeToolSelection: [
            { matcher: '*', hooks: [{ type: 'command', command: 'echo tool-select' }] },
          ],
        },
      }),
    );
    const results = await importFromGemini(TEST_DIR);
    // No hooks.yaml should be written (all 5 events have no canonical equivalent)
    expect(results.find((r) => r.toPath === '.agentsmesh/hooks.yaml')).toBeUndefined();
  });

  it('imports exactly 1 hooks result for a mix of mapped and unmapped events', async () => {
    mkdirSync(join(TEST_DIR, '.gemini'), { recursive: true });
    writeFileSync(
      join(TEST_DIR, GEMINI_SETTINGS),
      JSON.stringify({
        hooks: {
          BeforeTool: [{ matcher: 'Read', hooks: [{ type: 'command', command: 'echo pre' }] }],
          BeforeAgent: [
            { matcher: '*', hooks: [{ type: 'command', command: 'echo agent-start' }] },
          ],
          AfterAgent: [{ matcher: '*', hooks: [{ type: 'command', command: 'echo agent-stop' }] }],
          SessionStart: [{ matcher: '*', hooks: [{ type: 'command', command: 'echo session' }] }],
          // Gemini-only — should be dropped silently
          SessionEnd: [{ matcher: '*', hooks: [{ type: 'command', command: 'echo end' }] }],
        },
      }),
    );
    const results = await importFromGemini(TEST_DIR);
    const hooksResults = results.filter((r) => r.toPath === '.agentsmesh/hooks.yaml');
    // Exactly 1 hooks.yaml result (not 0, not 2)
    expect(hooksResults).toHaveLength(1);
    const content = readFileSync(join(TEST_DIR, '.agentsmesh', 'hooks.yaml'), 'utf-8');
    // Mapped events present
    expect(content).toContain('PreToolUse');
    expect(content).toContain('UserPromptSubmit');
    expect(content).toContain('SubagentStop');
    expect(content).toContain('SessionStart');
    // Gemini-only event dropped
    expect(content).not.toContain('SessionEnd');
    // No Gemini event names leak through
    expect(content).not.toContain('BeforeTool');
    expect(content).not.toContain('BeforeAgent');
    expect(content).not.toContain('AfterAgent');
  });
});
