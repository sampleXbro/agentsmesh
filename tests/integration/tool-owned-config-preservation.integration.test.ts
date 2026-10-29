/**
 * Ownership sweep: every generated path the TOOL also writes.
 *
 * Each case runs the real engine twice, exactly as the CLI does
 * (generate -> write results -> `cleanupStaleGeneratedOutputs`):
 *
 *   run 1: the feature is on  -> agentsmesh's keys land in the shared file
 *   run 2: the feature is off -> the run emits nothing for that path
 *
 * Before the fix, run 1 replaced the whole file (losing every key the tool or
 * the user put there) and run 2 DELETED it, because the path sat in
 * `managedOutputs.files`.
 *
 * MCP note: the server SET is canonical's by design — that is how revoking a
 * server works, and it is the contract every `mcpServersJsonMerger` call site
 * already has (claude-code `.mcp.json`, copilot, goose, antigravity). What must
 * survive is every OTHER top-level key and every per-server key canonical
 * cannot express (`disabled`, `autoApprove`, `timeout`, `cwd`).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { generate } from '../../src/core/generate/engine.js';
import { cleanupStaleGeneratedOutputs } from '../../src/core/generate/stale-cleanup.js';
import type { CanonicalFiles } from '../../src/core/types.js';
import type { ValidatedConfig } from '../../src/config/core/schema.js';
import type { TargetLayoutScope } from '../../src/targets/catalog/target-descriptor.js';

const TEST_DIR = join(tmpdir(), 'am-tool-owned-config');

type Json = Record<string, unknown>;

function canonical(): CanonicalFiles {
  return {
    rules: [
      {
        source: '_root.md',
        root: true,
        description: 'Root',
        body: 'Be careful.',
        globs: [],
        targets: [],
        alwaysApply: true,
      } as unknown as CanonicalFiles['rules'][number],
    ],
    commands: [],
    agents: [],
    skills: [],
    mcp: { mcpServers: { ctx: { type: 'stdio', command: 'npx', args: ['-y', 'ctx'], env: {} } } },
    permissions: { allow: ['Bash(ls)'], deny: ['Bash(rm)'], ask: [] },
    hooks: { PreToolUse: [{ matcher: 'Bash', command: 'echo canonical', type: 'command' }] },
    ignore: [],
  };
}

function config(target: string, features: string[]): ValidatedConfig {
  return {
    version: 1,
    targets: [target],
    features,
    extends: [],
    overrides: {},
    collaboration: { strategy: 'merge', lock_features: [] },
  };
}

function seed(relPath: string, value: Json): void {
  const abs = join(TEST_DIR, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, JSON.stringify(value, null, 2));
}

function read(relPath: string): Json {
  return JSON.parse(readFileSync(join(TEST_DIR, relPath), 'utf8')) as Json;
}

/** One full CLI-shaped pass: generate, write results, evict stale outputs. */
async function runGeneratePass(
  target: string,
  features: string[],
  scope: TargetLayoutScope,
): Promise<string[]> {
  const results = await generate({
    config: config(target, features),
    canonical: canonical(),
    projectRoot: TEST_DIR,
    scope,
  });
  for (const result of results) {
    const abs = join(TEST_DIR, result.path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, result.content);
  }
  await cleanupStaleGeneratedOutputs({
    projectRoot: TEST_DIR,
    targets: [target],
    expectedPaths: results.map((result) => result.path),
    scope,
  });
  return results.map((result) => result.path);
}

interface Case {
  readonly target: string;
  readonly scope: TargetLayoutScope;
  readonly feature: string;
  readonly path: string;
  readonly base: Json;
  /** Keys the user/tool owns that must read back unchanged after a generate. */
  readonly preserved: Json;
  /** Assertion that agentsmesh's own content did land. */
  readonly generated: (doc: Json) => void;
}

/** Shared MCP base: one foreign top-level key, one tool-only per-server key. */
function mcpBase(): Json {
  return {
    userKey: 'SENTINEL',
    mcpServers: {
      'my-server': { command: 'user-only' },
      ctx: { command: 'stale', disabled: true, autoApprove: ['read'] },
    },
  };
}

function expectMcpGenerated(doc: Json): void {
  const servers = doc.mcpServers as Json;
  expect(Object.keys(servers)).toEqual(['ctx']);
  expect(servers.ctx).toMatchObject({
    command: 'npx',
    args: ['-y', 'ctx'],
    disabled: true,
    autoApprove: ['read'],
  });
}

function mcpCase(target: string, scope: TargetLayoutScope, path: string): Case {
  return {
    target,
    scope,
    feature: 'mcp',
    path,
    base: mcpBase(),
    preserved: { userKey: 'SENTINEL' },
    generated: expectMcpGenerated,
  };
}

const MCP_CASES: readonly Case[] = [
  mcpCase('amazon-q', 'project', '.amazonq/mcp.json'),
  mcpCase('amazon-q', 'global', '.aws/amazonq/mcp.json'),
  mcpCase('cline', 'project', '.cline/mcp.json'),
  mcpCase('codebuff', 'project', '.agents/mcp.json'),
  mcpCase('codebuff', 'global', '.agents/mcp.json'),
  mcpCase('cursor', 'project', '.cursor/mcp.json'),
  mcpCase('cursor', 'global', '.cursor/mcp.json'),
  mcpCase('factory-droid', 'project', '.factory/mcp.json'),
  mcpCase('factory-droid', 'global', '.factory/mcp.json'),
  mcpCase('junie', 'project', '.junie/mcp/mcp.json'),
  mcpCase('junie', 'global', '.junie/mcp/mcp.json'),
  {
    target: 'kilo-code',
    scope: 'project',
    feature: 'mcp',
    path: 'kilo.jsonc',
    base: {
      userKey: 'SENTINEL',
      mcp: {
        stale: { type: 'local', command: ['stale'] },
        ctx: { type: 'local', command: ['old'], enabled: false, timeout: 5000 },
      },
    },
    preserved: { userKey: 'SENTINEL' },
    generated: (doc) => {
      const mcp = doc.mcp as Json;
      expect(Object.keys(mcp)).toEqual(['ctx']);
      expect(mcp.ctx).toMatchObject({
        type: 'local', command: ['npx', '-y', 'ctx'], enabled: false, timeout: 5000,
      });
    },
  },
  mcpCase('kimi-code', 'project', '.kimi-code/mcp.json'),
  mcpCase('kimi-code', 'global', '.kimi-code/mcp.json'),
  mcpCase('kiro', 'project', '.kiro/settings/mcp.json'),
  mcpCase('kiro', 'global', '.kiro/settings/mcp.json'),
  mcpCase('roo-code', 'project', '.roo/mcp.json'),
  mcpCase('rovodev', 'global', '.rovodev/mcp_config.json'),
  mcpCase('trae', 'project', '.trae/mcp.json'),
  mcpCase('trae', 'global', '.trae/mcp.json'),
  mcpCase('warp', 'project', '.warp/.mcp.json'),
  mcpCase('warp', 'global', '.warp/.mcp.json'),
  mcpCase('windsurf', 'global', '.codeium/windsurf/mcp_config.json'),
];

/** `{hooks: {...}}` wrapper files: the wrapper key is agentsmesh's, the rest is not. */
function wrappedHooksCase(target: string, scope: TargetLayoutScope, path: string): Case {
  return {
    target,
    scope,
    feature: 'hooks',
    path,
    base: { description: 'my hooks', userKey: 'SENTINEL', hooks: { Stale: [] } },
    preserved: { description: 'my hooks', userKey: 'SENTINEL' },
    generated: (doc) => expect(Object.keys(doc.hooks as Json).length).toBeGreaterThan(0),
  };
}

const HOOK_CASES: readonly Case[] = [
  {
    // Antigravity keys the document by USER-CHOSEN handler name, so a handler
    // is a foreign TOP-LEVEL key (antigravity.google/docs/hooks).
    target: 'antigravity',
    scope: 'project',
    feature: 'hooks',
    path: '.agents/hooks.json',
    base: { 'my-handler': { enabled: true, PreToolUse: [{ matcher: '*' }] } },
    preserved: { 'my-handler': { enabled: true, PreToolUse: [{ matcher: '*' }] } },
    generated: (doc) => expect(doc.PreToolUse).toBeDefined(),
  },
  {
    target: 'antigravity',
    scope: 'global',
    feature: 'hooks',
    path: '.gemini/config/hooks.json',
    base: { 'my-handler': { enabled: true, PreToolUse: [{ matcher: '*' }] } },
    preserved: { 'my-handler': { enabled: true, PreToolUse: [{ matcher: '*' }] } },
    generated: (doc) => expect(doc.PreToolUse).toBeDefined(),
  },
  wrappedHooksCase('codex-cli', 'project', '.codex/hooks.json'),
  wrappedHooksCase('codex-cli', 'global', '.codex/hooks.json'),
  wrappedHooksCase('cursor', 'project', '.cursor/hooks.json'),
  wrappedHooksCase('cursor', 'global', '.cursor/hooks.json'),
  wrappedHooksCase('factory-droid', 'project', '.factory/hooks.json'),
  wrappedHooksCase('factory-droid', 'global', '.factory/hooks.json'),
  wrappedHooksCase('trae', 'project', '.trae/hooks.json'),
  wrappedHooksCase('trae', 'global', '.trae-cn/hooks.json'),
  wrappedHooksCase('windsurf', 'project', '.windsurf/hooks.json'),
  wrappedHooksCase('windsurf', 'global', '.codeium/windsurf/hooks.json'),
];

const PERMISSION_CASES: readonly Case[] = [
  {
    target: 'cursor',
    scope: 'project',
    feature: 'permissions',
    path: '.cursor/cli.json',
    base: { version: 3, editor: { vimMode: true }, permissions: { allow: ['stale'] } },
    preserved: { version: 3, editor: { vimMode: true } },
    generated: (doc) => expect((doc.permissions as Json).allow).toEqual(['Bash(ls)']),
  },
  {
    target: 'cursor',
    scope: 'global',
    feature: 'permissions',
    path: '.cursor/cli-config.json',
    base: { version: 3, editor: { vimMode: true }, permissions: { allow: ['stale'] } },
    preserved: { version: 3, editor: { vimMode: true } },
    generated: (doc) => expect((doc.permissions as Json).allow).toEqual(['Bash(ls)']),
  },
  {
    target: 'factory-droid',
    scope: 'project',
    feature: 'permissions',
    path: '.factory/settings.json',
    base: { model: 'claude', autonomyLevel: 'high', commandAllowlist: ['stale'] },
    preserved: { model: 'claude', autonomyLevel: 'high' },
    generated: (doc) => expect(doc.commandAllowlist).toEqual(['Bash(ls)']),
  },
  {
    target: 'factory-droid',
    scope: 'global',
    feature: 'permissions',
    path: '.factory/settings.json',
    base: { model: 'claude', autonomyLevel: 'high', commandAllowlist: ['stale'] },
    preserved: { model: 'claude', autonomyLevel: 'high' },
    generated: (doc) => expect(doc.commandAllowlist).toEqual(['Bash(ls)']),
  },
  {
    // Junie persists the user's "Always allow" approvals here; agentsmesh owns
    // only `rules.executables`.
    target: 'junie',
    scope: 'global',
    feature: 'permissions',
    path: '.junie/allowlist.json',
    base: {
      defaultBehavior: 'allow',
      allowReadonlyCommands: false,
      rules: {
        fileEditing: { rules: [{ pattern: 'src/**', action: 'allow' }] },
        executables: { rules: [{ prefix: 'stale', action: 'allow' }] },
        readSecretFile: { rules: [{ prefix: '.env', action: 'ask' }] },
      },
    },
    preserved: {
      defaultBehavior: 'allow',
      allowReadonlyCommands: false,
    },
    generated: (doc) => {
      const rules = doc.rules as Json;
      expect(rules.fileEditing).toEqual({ rules: [{ pattern: 'src/**', action: 'allow' }] });
      expect(rules.readSecretFile).toEqual({ rules: [{ prefix: '.env', action: 'ask' }] });
      expect((rules.executables as Json).rules).toEqual([
        { prefix: 'Bash(ls)', action: 'allow' },
        { prefix: 'Bash(rm)', action: 'ask' },
      ]);
    },
  },
];

const CASES: readonly Case[] = [...MCP_CASES, ...HOOK_CASES, ...PERMISSION_CASES];

beforeEach(() => mkdirSync(TEST_DIR, { recursive: true }));
afterEach(() => rmSync(TEST_DIR, { recursive: true, force: true }));

describe('generate never replaces or deletes a config file the tool writes too', () => {
  for (const testCase of CASES) {
    const { target, scope, feature, path } = testCase;
    it(`${target} ${scope} ${path} survives a ${feature} generate and a ${feature}-off run`, async () => {
      seed(path, testCase.base);

      const emitted = await runGeneratePass(target, [feature, 'rules'], scope);
      expect(emitted).toContain(path);

      const afterFirst = read(path);
      expect(afterFirst).toMatchObject(testCase.preserved);
      testCase.generated(afterFirst);

      await runGeneratePass(target, ['rules'], scope);

      expect(existsSync(join(TEST_DIR, path))).toBe(true);
      expect(read(path)).toMatchObject(testCase.preserved);
    });
  }
});

describe('.cline/agents.yaml is merged, not replaced or deleted', () => {
  it('keeps a foreign top-level key and survives an agents-off run', async () => {
    const abs = join(TEST_DIR, '.cline/agents.yaml');
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, 'userKey: SENTINEL\nagents:\n  - name: mine\n');

    await runGeneratePass('cline', ['agents', 'rules'], 'project');
    const afterFirst = readFileSync(abs, 'utf8');
    expect(afterFirst).toContain('userKey: SENTINEL');

    await runGeneratePass('cline', ['rules'], 'project');
    expect(existsSync(abs)).toBe(true);
    expect(readFileSync(abs, 'utf8')).toContain('userKey: SENTINEL');
  });
});

describe('the reported windsurf probe', () => {
  it('keeps the user key in ~/.codeium/windsurf/mcp_config.json', async () => {
    seed('.codeium/windsurf/mcp_config.json', {
      mcpServers: { 'my-server': { command: 'mine' } },
      userKey: 'SENTINEL',
    });

    await runGeneratePass('windsurf', ['mcp', 'rules'], 'global');

    const doc = read('.codeium/windsurf/mcp_config.json');
    expect(doc.userKey).toBe('SENTINEL');
    // The server set is canonical's — that is how revocation works.
    expect(Object.keys(doc.mcpServers as Json)).toEqual(['ctx']);
  });
});
