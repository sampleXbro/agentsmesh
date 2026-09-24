import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runLint } from '../../../src/core/lint/linter.js';
import type { ValidatedConfig } from '../../../src/config/core/schema.js';
import type { CanonicalFiles } from '../../../src/core/types.js';

const TEST_DIR = join(tmpdir(), 'agentsmesh-linter-test');

beforeEach(() => mkdirSync(TEST_DIR, { recursive: true }));
afterEach(() => rmSync(TEST_DIR, { recursive: true, force: true }));

function minimalConfig(overrides?: Partial<ValidatedConfig>): ValidatedConfig {
  return {
    version: 1,
    targets: ['claude-code', 'cursor'],
    features: ['rules'],
    extends: [],
    overrides: {},
    collaboration: { strategy: 'merge', lock_features: [] },
    ...overrides,
  };
}

describe('runLint', () => {
  it('returns empty when no rules and rules feature disabled', async () => {
    const config = minimalConfig({ features: [] });
    const canonical: CanonicalFiles = {
      rules: [],
      commands: [],
      agents: [],
      skills: [],
      mcp: null,
      permissions: null,
      hooks: null,
      ignore: [],
    };
    const { diagnostics } = await runLint(config, canonical, TEST_DIR);
    expect(diagnostics).toEqual([]);
  });

  it('returns empty when rules valid (root rule exists)', async () => {
    const config = minimalConfig();
    const canonical: CanonicalFiles = {
      rules: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'),
          root: true,
          targets: [],
          description: 'Root',
          globs: [],
          body: 'Use TypeScript',
        },
      ],
      commands: [],
      agents: [],
      skills: [],
      mcp: null,
      permissions: null,
      hooks: null,
      ignore: [],
    };
    const { diagnostics } = await runLint(config, canonical, TEST_DIR);
    expect(diagnostics).toEqual([]);
  });

  it('returns error when rules exist but no root rule', async () => {
    const config = minimalConfig();
    const canonical: CanonicalFiles = {
      rules: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'rules', 'typescript.md'),
          root: false,
          targets: [],
          description: 'TS',
          globs: ['src/**/*.ts'],
          body: 'Use TS',
        },
      ],
      commands: [],
      agents: [],
      skills: [],
      mcp: null,
      permissions: null,
      hooks: null,
      ignore: [],
    };
    const { diagnostics, hasErrors } = await runLint(config, canonical, TEST_DIR);
    expect(hasErrors).toBe(true);
    expect(diagnostics.some((d) => d.level === 'error')).toBe(true);
    expect(diagnostics.some((d) => d.message.includes('root'))).toBe(true);
  });

  it('returns warning when rule globs match 0 files', async () => {
    const config = minimalConfig();
    const rulesDir = join(TEST_DIR, '.agentsmesh', 'rules');
    mkdirSync(rulesDir, { recursive: true });
    mkdirSync(join(TEST_DIR, 'src'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'src', 'foo.ts'), 'x');
    const canonical: CanonicalFiles = {
      rules: [
        {
          source: join(rulesDir, '_root.md'),
          root: true,
          targets: [],
          description: 'Root',
          globs: [],
          body: 'Root',
        },
        {
          source: join(rulesDir, 'nonexistent.md'),
          root: false,
          targets: [],
          description: 'None',
          globs: ['lib/**/*.ts'],
          body: 'None',
        },
      ],
      commands: [],
      agents: [],
      skills: [],
      mcp: null,
      permissions: null,
      hooks: null,
      ignore: [],
    };
    const { diagnostics } = await runLint(config, canonical, TEST_DIR);
    const warnings = diagnostics.filter((d) => d.level === 'warning');
    expect(warnings.some((d) => d.message.includes('match 0 files'))).toBe(true);
  });

  it('returns warning (not error) for codex-cli when no root rule', async () => {
    const config = minimalConfig({ targets: ['codex-cli'] });
    const canonical: CanonicalFiles = {
      rules: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'rules', 'only.md'),
          root: false,
          targets: [],
          description: 'Only',
          globs: [],
          body: 'Only rule',
        },
      ],
      commands: [],
      agents: [],
      skills: [],
      mcp: null,
      permissions: null,
      hooks: null,
      ignore: [],
    };
    const { diagnostics, hasErrors } = await runLint(config, canonical, TEST_DIR);
    expect(hasErrors).toBe(false);
    const codexDiag = diagnostics.find((d) => d.target === 'codex-cli');
    expect(codexDiag).toBeDefined();
    expect(codexDiag!.level).toBe('warning');
    expect(codexDiag!.message).toContain('root rule');
  });

  it('returns warning (not error) for windsurf when no root rule', async () => {
    const config = minimalConfig({ targets: ['windsurf'] });
    const canonical: CanonicalFiles = {
      rules: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'rules', 'only.md'),
          root: false,
          targets: [],
          description: 'Only',
          globs: [],
          body: 'Only rule',
        },
      ],
      commands: [],
      agents: [],
      skills: [],
      mcp: null,
      permissions: null,
      hooks: null,
      ignore: [],
    };
    const { diagnostics, hasErrors } = await runLint(config, canonical, TEST_DIR);
    expect(hasErrors).toBe(false);
    const windsurfDiag = diagnostics.find((d) => d.target === 'windsurf');
    expect(windsurfDiag).toBeDefined();
    expect(windsurfDiag!.level).toBe('warning');
    expect(windsurfDiag!.message).toContain('root rule');
  });

  it('respects target filter', async () => {
    const config = minimalConfig();
    const canonical: CanonicalFiles = {
      rules: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'),
          root: true,
          targets: [],
          description: 'Root',
          globs: [],
          body: 'Root',
        },
      ],
      commands: [],
      agents: [],
      skills: [],
      mcp: null,
      permissions: null,
      hooks: null,
      ignore: [],
    };
    const { diagnostics } = await runLint(config, canonical, TEST_DIR, ['claude-code']);
    expect(diagnostics.every((d) => d.target === 'claude-code')).toBe(true);
  });

  it('still lints non-rule features when rules are disabled', async () => {
    const config = minimalConfig({
      targets: ['cursor', 'gemini-cli'],
      features: ['commands', 'mcp', 'permissions', 'hooks'],
    });
    const canonical: CanonicalFiles = {
      rules: [],
      commands: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'commands', 'review.md'),
          name: 'review',
          description: 'Review code',
          allowedTools: ['Read'],
          body: 'Review the diff.',
        },
      ],
      agents: [],
      skills: [],
      mcp: {
        mcpServers: {
          remote: {
            type: 'http',
            url: 'https://example.com/mcp?token=${API_TOKEN}',
            headers: { Authorization: 'Bearer ${API_TOKEN}' },
            env: { API_TOKEN: '${API_TOKEN}' },
          },
        },
      },
      permissions: {
        allow: [],
        deny: ['Bash(rm -rf:*)'],
      },
      hooks: {
        SessionEnd: [{ matcher: '*', command: 'echo end' }],
      },
      ignore: [],
    };

    const { diagnostics, hasErrors } = await runLint(config, canonical, TEST_DIR);

    expect(hasErrors).toBe(false);
    expect(diagnostics).toContainEqual({
      level: 'warning',
      file: join(TEST_DIR, '.agentsmesh', 'commands', 'review.md'),
      target: 'cursor',
      message:
        'Cursor command files project only description frontmatter; allowed-tools metadata is not projected.',
    });
    expect(diagnostics).toContainEqual({
      level: 'warning',
      file: '.agentsmesh/mcp.json',
      target: 'cursor',
      message:
        'MCP server "remote" uses env vars or URL/header interpolation; Cursor handling may differ from canonical MCP.',
    });
    expect(diagnostics).toContainEqual({
      level: 'warning',
      file: '.agentsmesh/hooks.yaml',
      target: 'gemini-cli',
      message:
        'SessionEnd is not supported by gemini-cli; only PreToolUse, PostToolUse, Notification, UserPromptSubmit, SubagentStart, SubagentStop, and SessionStart are projected.',
    });
    // cursor permissions are native — no stale 'partial' warning should appear
    expect(
      diagnostics.some(
        (d) => d.target === 'cursor' && d.message.includes('Cursor permissions are partial'),
      ),
    ).toBe(false);
  });

  it('warns when cursor MCP uses env vars with tool-specific handling differences', async () => {
    const config = minimalConfig({ targets: ['cursor'], features: ['rules', 'mcp'] });
    const canonical: CanonicalFiles = {
      rules: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'),
          root: true,
          targets: [],
          description: 'Root',
          globs: [],
          body: 'Root',
        },
      ],
      commands: [],
      agents: [],
      skills: [],
      mcp: {
        mcpServers: {
          ctx: {
            type: 'stdio',
            command: 'npx',
            args: ['server'],
            env: { API_KEY: '${API_KEY}' },
          },
        },
      },
      permissions: null,
      hooks: null,
      ignore: [],
    };
    const { diagnostics, hasErrors } = await runLint(config, canonical, TEST_DIR);
    expect(hasErrors).toBe(false);
    expect(diagnostics).toContainEqual({
      level: 'warning',
      file: '.agentsmesh/mcp.json',
      target: 'cursor',
      message:
        'MCP server "ctx" uses env vars or URL/header interpolation; Cursor handling may differ from canonical MCP.',
    });
  });

  it('warns when codex-cli drops MCP descriptions from config.toml output', async () => {
    const config = minimalConfig({ targets: ['codex-cli'], features: ['rules', 'mcp'] });
    const canonical: CanonicalFiles = {
      rules: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'),
          root: true,
          targets: [],
          description: 'Root',
          globs: [],
          body: 'Root',
        },
      ],
      commands: [],
      agents: [],
      skills: [],
      mcp: {
        mcpServers: {
          github: {
            description: 'GitHub MCP server for repo operations',
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
            env: {},
          },
        },
      },
      permissions: null,
      hooks: null,
      ignore: [],
    };
    const { diagnostics, hasErrors } = await runLint(config, canonical, TEST_DIR);
    expect(hasErrors).toBe(false);
    expect(diagnostics).toContainEqual({
      level: 'warning',
      file: '.agentsmesh/mcp.json',
      target: 'codex-cli',
      message:
        'MCP server "github" has a description, but codex-cli does not project MCP descriptions into .codex/config.toml.',
    });
  });

  it('does not warn for Junie non-root canonical rules projection', async () => {
    const config = minimalConfig({ targets: ['junie'], features: ['rules'] });
    const canonical: CanonicalFiles = {
      rules: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'),
          root: true,
          targets: [],
          description: 'Root',
          globs: [],
          body: 'Root',
        },
        {
          source: join(TEST_DIR, '.agentsmesh', 'rules', 'typescript.md'),
          root: false,
          targets: [],
          description: 'Scoped',
          globs: ['src/**/*.ts'],
          body: 'Use strict TypeScript.',
        },
      ],
      commands: [],
      agents: [],
      skills: [],
      mcp: null,
      permissions: null,
      hooks: null,
      ignore: [],
    };

    const { diagnostics, hasErrors } = await runLint(config, canonical, TEST_DIR);
    expect(hasErrors).toBe(false);
    expect(diagnostics).not.toContainEqual(
      expect.objectContaining({
        target: 'junie',
        message: expect.stringContaining('non-root canonical rules are not projected'),
      }),
    );
  });

  it('warns when Junie MCP config uses URL-based transports', async () => {
    const config = minimalConfig({ targets: ['junie'], features: ['rules', 'mcp'] });
    const canonical: CanonicalFiles = {
      rules: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'),
          root: true,
          targets: [],
          description: 'Root',
          globs: [],
          body: 'Root',
        },
      ],
      commands: [],
      agents: [],
      skills: [],
      mcp: {
        mcpServers: {
          remote: {
            type: 'http',
            url: 'https://mcp.example.com',
            headers: {},
            env: {},
          },
        },
      },
      permissions: null,
      hooks: null,
      ignore: [],
    };

    const { diagnostics, hasErrors } = await runLint(config, canonical, TEST_DIR);
    expect(hasErrors).toBe(false);
    expect(diagnostics).toContainEqual({
      level: 'warning',
      file: '.agentsmesh/mcp.json',
      target: 'junie',
      message:
        'MCP server "remote" uses http transport; Junie project mcp.json currently documents stdio MCP servers only.',
    });
  });

  it('surfaces lessons-subsystem diagnostics through runLint', async () => {
    mkdirSync(join(TEST_DIR, '.agentsmesh', 'lessons'), { recursive: true });
    writeFileSync(join(TEST_DIR, '.agentsmesh', 'lessons', 'lessons.json'), '{ not json }', 'utf8');
    const config = minimalConfig({ features: [] });
    const canonical: CanonicalFiles = {
      rules: [],
      commands: [],
      agents: [],
      skills: [],
      mcp: null,
      permissions: null,
      hooks: null,
      ignore: [],
    };
    const { diagnostics, hasErrors } = await runLint(config, canonical, TEST_DIR);
    expect(hasErrors).toBe(true);
    expect(diagnostics.some((d) => d.target === 'lessons' && d.level === 'error')).toBe(true);
  });

  it('dispatches descriptor.lint.ignore when ignore feature is enabled and patterns exist', async () => {
    // jules has ignore: 'partial' and lint.ignore wired; the engine must call it.
    // Before the fix, descriptor.lint?.ignore is never dispatched and the warning is
    // silently dropped (the silent-drop guard skips non-none capabilities).
    const config = minimalConfig({
      targets: ['jules'],
      features: ['rules', 'ignore'],
    });
    const canonical: CanonicalFiles = {
      rules: [
        {
          source: join(TEST_DIR, '.agentsmesh', 'rules', '_root.md'),
          root: true,
          targets: [],
          description: 'Root',
          globs: [],
          body: '# Root',
        },
      ],
      commands: [],
      agents: [],
      skills: [],
      mcp: null,
      permissions: null,
      hooks: null,
      ignore: ['node_modules', '.env'],
    };
    const { diagnostics } = await runLint(config, canonical, TEST_DIR);
    expect(diagnostics).toContainEqual({
      level: 'warning',
      file: '.agentsmesh/ignore',
      target: 'jules',
      message:
        'Jules is a cloud-based agent with no dedicated ignore file; canonical ignore patterns are not projected.',
    });
  });
});
