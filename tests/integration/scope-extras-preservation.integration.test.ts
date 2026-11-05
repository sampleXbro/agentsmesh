/**
 * `globalSupport.scopeExtras` is the third emission path in `generate`, and the
 * only one that used to bypass the shared merge policy: `engine.ts` pushed its
 * results raw. Every generator that built its content from canonical alone
 * therefore replaced a user-co-owned tool config wholesale.
 *
 * One test per path the audit found replacing wholesale. Each seeds real user
 * content, runs a real global-scope `generate`, and asserts BOTH halves of the
 * contract: the user's own content survives, and content agentsmesh no longer
 * generates is still revoked.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse as parseToml } from 'smol-toml';
import { parse as parseYaml } from 'yaml';
import { generate } from '../../src/core/generate/engine.js';
import type { CanonicalFiles, GenerateResult } from '../../src/core/types.js';
import type { ValidatedConfig } from '../../src/config/core/schema.js';

const TEST_DIR = join(tmpdir(), 'am-scope-extras-preservation');

function emptyCanonical(): CanonicalFiles {
  return {
    rules: [],
    commands: [],
    agents: [],
    skills: [],
    mcp: null,
    permissions: null,
    hooks: null,
    ignore: [],
  };
}

function rule(): CanonicalFiles['rules'][number] {
  return {
    source: '_root.md',
    root: true,
    targets: [],
    description: 'Root',
    globs: [],
    body: 'Be careful.',
  };
}

function agent(name: string): CanonicalFiles['agents'][number] {
  return {
    source: `${name}.md`,
    name,
    description: `${name} agent`,
    tools: ['Read'],
    disallowedTools: [],
    model: '',
    permissionMode: '',
    maxTurns: 0,
    mcpServers: [],
    hooks: {},
    skills: [],
    memory: '',
    body: `You are ${name}.`,
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

function seed(relPath: string, content: string): void {
  const abs = join(TEST_DIR, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

async function runGlobal(
  target: string,
  features: string[],
  canonical: CanonicalFiles,
): Promise<GenerateResult[]> {
  const results = await generate({
    config: config(target, features),
    canonical,
    projectRoot: TEST_DIR,
    scope: 'global',
  });
  for (const result of results) {
    const abs = join(TEST_DIR, result.path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, result.content);
  }
  return results;
}

function emitted(results: GenerateResult[], path: string): GenerateResult {
  const found = results.find((r) => r.path === path);
  expect(found, `no generated result for ${path}`).toBeDefined();
  return found!;
}

beforeEach(() => mkdirSync(TEST_DIR, { recursive: true }));
afterEach(() => rmSync(TEST_DIR, { recursive: true, force: true }));

describe('scopeExtras output never replaces a user-co-owned config wholesale', () => {
  it('copilot ~/.copilot/mcp-config.json keeps foreign keys and per-server user fields', async () => {
    seed(
      '.copilot/mcp-config.json',
      JSON.stringify(
        {
          $schema: 'https://example.invalid/copilot.json',
          mcpServers: {
            ctx: { command: 'npx', args: ['-y', 'ctx'], tools: ['search'], enabled: false },
            gone: { command: 'old' },
          },
        },
        null,
        2,
      ),
    );

    const canonical = emptyCanonical();
    canonical.mcp = {
      mcpServers: { ctx: { type: 'stdio', command: 'npx', args: ['-y', 'ctx'], env: {} } },
    };

    const results = await runGlobal('copilot', ['mcp'], canonical);
    const parsed = JSON.parse(emitted(results, '.copilot/mcp-config.json').content) as Record<
      string,
      unknown
    >;

    expect(parsed.$schema).toBe('https://example.invalid/copilot.json');
    const servers = parsed.mcpServers as Record<string, Record<string, unknown>>;
    expect(servers.ctx!.tools).toEqual(['search']);
    expect(servers.ctx!.enabled).toBe(false);
    expect(servers.ctx!.command).toBe('npx');
    expect(servers.gone).toBeUndefined();
  });

  it('continue ~/.continue/config.yaml keeps models, apiKey and the assistant name', async () => {
    seed(
      '.continue/config.yaml',
      [
        'name: My Assistant',
        'version: 3',
        'schema: v1',
        'models:',
        '  - name: gpt',
        '    provider: openai',
        '    apiKey: sk-secret',
        'context:',
        '  - provider: code',
        'mcpServers:',
        '  - name: gone',
        '    command: old',
        '',
      ].join('\n'),
    );

    const canonical = emptyCanonical();
    canonical.rules = [rule()];
    canonical.mcp = {
      mcpServers: { ctx: { type: 'stdio', command: 'npx', args: ['-y', 'ctx'], env: {} } },
    };

    const results = await runGlobal('continue', ['rules', 'mcp'], canonical);
    const parsed = parseYaml(emitted(results, '.continue/config.yaml').content) as Record<
      string,
      unknown
    >;

    expect(parsed.name).toBe('My Assistant');
    expect(parsed.models).toEqual([{ name: 'gpt', provider: 'openai', apiKey: 'sk-secret' }]);
    expect(parsed.context).toEqual([{ provider: 'code' }]);
    const servers = parsed.mcpServers as Array<Record<string, unknown>>;
    expect(servers.map((s) => s.name)).toEqual(['ctx']);
  });

  it('continue ~/.continue/permissions.yaml keeps the buckets canonical does not manage', async () => {
    seed(
      '.continue/permissions.yaml',
      ['allow:', '  - Read(*)', 'ask:', '  - Write(src/**)', 'exclude:', '  - Bash(rm:*)', ''].join(
        '\n',
      ),
    );

    const canonical = emptyCanonical();
    canonical.permissions = { allow: ['Grep'] };

    const results = await runGlobal('continue', ['permissions'], canonical);
    const parsed = parseYaml(emitted(results, '.continue/permissions.yaml').content) as Record<
      string,
      unknown
    >;

    expect(parsed.ask).toEqual(['Write(src/**)']);
    expect(parsed.exclude).toEqual(['Bash(rm:*)']);
    expect(parsed.allow).toEqual(['Grep']);
  });

  it('gemini-cli ~/.gemini/policies/permissions.toml keeps hand-written rules', async () => {
    seed(
      '.gemini/policies/permissions.toml',
      [
        '[[rule]]',
        'decision = "ask_user"',
        'priority = 5',
        'toolName = "write_file"',
        '',
        '[[rule]]',
        'decision = "deny"',
        'priority = 6',
        'toolName = "google_web_search"',
        '',
      ].join('\n'),
    );

    const canonical = emptyCanonical();
    canonical.permissions = { allow: ['Read'], deny: [] };

    const results = await runGlobal('gemini-cli', ['permissions'], canonical);
    const parsed = parseToml(
      emitted(results, '.gemini/policies/permissions.toml').content,
    ) as unknown as {
      rule: Array<Record<string, unknown>>;
    };

    const byTool = new Map(parsed.rule.map((r) => [r.toolName as string, r]));
    expect(byTool.get('write_file')?.decision).toBe('ask_user');
    expect(byTool.get('google_web_search')?.decision).toBe('deny');
    expect(byTool.get('read_file')?.decision).toBe('allow');
  });

  it('gemini-cli revokes a policy rule agentsmesh no longer generates', async () => {
    const first = emptyCanonical();
    first.permissions = { allow: ['Read'], deny: ['Bash(rm:*)'] };
    await runGlobal('gemini-cli', ['permissions'], first);

    const second = emptyCanonical();
    second.permissions = { allow: ['Read'], deny: [] };
    const results = await runGlobal('gemini-cli', ['permissions'], second);

    const content = emitted(results, '.gemini/policies/permissions.toml').content;
    expect(content).not.toContain('run_shell_command');
    expect(content).toContain('read_file');
  });

  it('deepagents-cli ~/.deepagents/hooks.json keeps unmapped-event hooks and foreign keys', async () => {
    seed(
      '.deepagents/hooks.json',
      JSON.stringify(
        {
          version: 2,
          hooks: [
            { command: ['notify', 'me'], events: ['tool.error'] },
            { command: ['bash', '-c', 'old'], events: ['session.start'] },
          ],
        },
        null,
        2,
      ),
    );

    const canonical = emptyCanonical();
    canonical.hooks = { SessionStart: [{ matcher: '', type: 'command', command: 'echo hi' }] };

    const results = await runGlobal('deepagents-cli', ['hooks'], canonical);
    const parsed = JSON.parse(emitted(results, '.deepagents/hooks.json').content) as {
      version: number;
      hooks: Array<{ command: string[]; events: string[] }>;
    };

    expect(parsed.version).toBe(2);
    expect(parsed.hooks).toContainEqual({ command: ['notify', 'me'], events: ['tool.error'] });
    expect(parsed.hooks).toContainEqual({
      command: ['bash', '-c', 'echo hi'],
      events: ['session.start'],
    });
    expect(parsed.hooks).not.toContainEqual({
      command: ['bash', '-c', 'old'],
      events: ['session.start'],
    });
  });

  it('roo-code ~/.roo/settings/custom_modes.yaml keeps user modes and per-mode fields', async () => {
    seed(
      '.roo/settings/custom_modes.yaml',
      [
        'customModes:',
        '  - slug: my-mode',
        '    name: Mine',
        '    roleDefinition: Do my thing',
        '    groups:',
        '      - read',
        '  - slug: reviewer',
        '    name: Old Reviewer',
        '    roleDefinition: stale',
        '    whenToUse: When reviewing',
        '    customInstructions: Be terse',
        '    groups:',
        '      - read',
        '',
      ].join('\n'),
    );

    const canonical = emptyCanonical();
    canonical.agents = [agent('reviewer')];

    const results = await runGlobal('roo-code', ['agents'], canonical);
    const parsed = parseYaml(
      emitted(results, '.roo/settings/custom_modes.yaml').content,
    ) as unknown as {
      customModes: Array<Record<string, unknown>>;
    };

    const bySlug = new Map(parsed.customModes.map((m) => [m.slug as string, m]));
    expect(bySlug.get('my-mode')?.name).toBe('Mine');
    expect(bySlug.get('reviewer')?.whenToUse).toBe('When reviewing');
    expect(bySlug.get('reviewer')?.customInstructions).toBe('Be terse');
    expect(bySlug.get('reviewer')?.roleDefinition).toBe('You are reviewer.');
  });

  it('roo-code revokes a mode whose canonical agent is gone', async () => {
    const first = emptyCanonical();
    first.agents = [agent('reviewer'), agent('tester')];
    await runGlobal('roo-code', ['agents'], first);

    const second = emptyCanonical();
    second.agents = [agent('reviewer')];
    const results = await runGlobal('roo-code', ['agents'], second);

    const parsed = parseYaml(
      emitted(results, '.roo/settings/custom_modes.yaml').content,
    ) as unknown as {
      customModes: Array<Record<string, unknown>>;
    };
    expect(parsed.customModes.map((m) => m.slug)).toEqual(['reviewer']);
  });
});

describe('scopeExtras generators that already merge stay correct under the shared policy', () => {
  it('zed still revokes context_servers the canonical file no longer lists', async () => {
    seed(
      '.config/zed/settings.json',
      JSON.stringify({ theme: 'One Dark', context_servers: { stale: { command: 'x' } } }, null, 2),
    );

    const canonical = emptyCanonical();
    canonical.mcp = { mcpServers: {} };

    const results = await runGlobal('zed', ['mcp'], canonical);
    const parsed = JSON.parse(emitted(results, '.config/zed/settings.json').content) as Record<
      string,
      unknown
    >;

    expect(parsed.theme).toBe('One Dark');
    expect(parsed.context_servers).toBeUndefined();
  });
});
