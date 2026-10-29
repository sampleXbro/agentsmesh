import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getTargetLayout } from '../../../../src/targets/catalog/builtin-targets.js';
import { generate } from '../../../../src/core/generate/engine.js';
import type { ValidatedConfig } from '../../../../src/config/core/schema.js';
import type { CanonicalFiles } from '../../../../src/core/types.js';

describe('cursor global layout — paths', () => {
  const layout = getTargetLayout('cursor', 'global')!;

  it('resolves rule path to .cursor/rules/', () => {
    expect(
      layout.paths.rulePath('typescript', {
        source: 'typescript.md',
        root: false,
        targets: [],
        description: '',
        globs: [],
        body: '',
      }),
    ).toBe('.cursor/rules/typescript.mdc');
  });

  it('resolves command path to .cursor/commands/', () => {
    expect(layout.paths.commandPath('review', {} as never)).toBe('.cursor/commands/review.md');
  });

  it('resolves agent path to .cursor/agents/', () => {
    expect(layout.paths.agentPath('reviewer', {} as never)).toBe('.cursor/agents/reviewer.md');
  });
});

describe('cursor global layout — rewriteGeneratedPath', () => {
  const layout = getTargetLayout('cursor', 'global')!;
  const rewrite = layout.rewriteGeneratedPath!;

  it('suppresses AGENTS.md (returns null)', () => {
    expect(rewrite('AGENTS.md')).toBeNull();
  });

  it('keeps .cursor/AGENTS.md unchanged', () => {
    expect(rewrite('.cursor/AGENTS.md')).toBe('.cursor/AGENTS.md');
  });

  it('keeps .cursor/rules/general.mdc unchanged', () => {
    expect(rewrite('.cursor/rules/general.mdc')).toBe('.cursor/rules/general.mdc');
  });

  it('keeps .cursor/rules/*.mdc unchanged', () => {
    expect(rewrite('.cursor/rules/typescript.mdc')).toBe('.cursor/rules/typescript.mdc');
  });

  it('keeps .cursor/commands/ paths unchanged', () => {
    expect(rewrite('.cursor/commands/review.md')).toBe('.cursor/commands/review.md');
  });

  it('keeps .cursor/agents/ paths unchanged', () => {
    expect(rewrite('.cursor/agents/reviewer.md')).toBe('.cursor/agents/reviewer.md');
  });

  it('keeps .cursor/skills/ paths unchanged', () => {
    expect(rewrite('.cursor/skills/ts-pro/SKILL.md')).toBe('.cursor/skills/ts-pro/SKILL.md');
  });

  it('keeps .cursor/mcp.json unchanged', () => {
    expect(rewrite('.cursor/mcp.json')).toBe('.cursor/mcp.json');
  });

  it('keeps .cursor/hooks.json unchanged', () => {
    expect(rewrite('.cursor/hooks.json')).toBe('.cursor/hooks.json');
  });

  it('does not emit project .cursorignore into global scope', () => {
    expect(rewrite('.cursorignore')).toBeNull();
  });

  it('keeps .cursor/cli-config.json unchanged (global-scope permissions file)', () => {
    // Global-scope cursor permissions use ~/.cursor/cli-config.json (distinct from project-scope .cursor/cli.json)
    // per https://cursor.com/docs/cli/reference/permissions
    expect(rewrite('.cursor/cli-config.json')).toBe('.cursor/cli-config.json');
  });

  it('suppresses .cursor/settings.json (not in global mode)', () => {
    expect(rewrite('.cursor/settings.json')).toBeNull();
  });
});

describe('cursor global layout — mirrorGlobalPath', () => {
  const layout = getTargetLayout('cursor', 'global')!;
  const mirror = layout.mirrorGlobalPath!;

  it('mirrors .cursor/skills/ to .agents/skills/', () => {
    expect(mirror('.cursor/skills/ts-pro/SKILL.md', [])).toBe('.agents/skills/ts-pro/SKILL.md');
  });

  it('mirrors nested supporting file under .cursor/skills/', () => {
    expect(mirror('.cursor/skills/ts-pro/references/checklist.md', [])).toBe(
      '.agents/skills/ts-pro/references/checklist.md',
    );
  });

  it('does not mirror when codex-cli is active', () => {
    expect(mirror('.cursor/skills/ts-pro/SKILL.md', ['codex-cli'])).toBeNull();
  });

  it('returns null for rule files (not mirrored)', () => {
    expect(mirror('.cursor/rules/typescript.mdc', [])).toBeNull();
  });

  it('returns null for command files (not mirrored)', () => {
    expect(mirror('.cursor/commands/review.md', [])).toBeNull();
  });

  it('returns null for agent files (not mirrored)', () => {
    expect(mirror('.cursor/agents/reviewer.md', [])).toBeNull();
  });

  it('returns null for MCP file (not mirrored)', () => {
    expect(mirror('.cursor/mcp.json', [])).toBeNull();
  });

  it('returns null for AGENTS.md (not mirrored)', () => {
    expect(mirror('.cursor/AGENTS.md', [])).toBeNull();
  });
});

describe('cursor global frontmatter preservation', () => {
  const TEST_DIR = join(tmpdir(), 'am-cursor-global-fm');

  function makeGlobalConfig(): ValidatedConfig {
    return {
      version: 1,
      targets: ['cursor'],
      features: ['rules', 'skills'],
      extends: [],
      overrides: {},
      collaboration: { strategy: 'merge', lock_features: [] },
    } as ValidatedConfig;
  }

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

  it('preserves skill frontmatter in global mode', async () => {
    const results = await generate({
      config: makeGlobalConfig(),
      canonical: makeCanonical({
        skills: [
          {
            source: '/proj/.agentsmesh/skills/debugging/SKILL.md',
            name: 'debugging',
            description: 'Debug workflow',
            body: '# Debugging\n\nReproduce first.',
            supportingFiles: [],
          },
        ],
      }),
      projectRoot: TEST_DIR,
      scope: 'global',
    });

    const skill = results.find(
      (r) => r.target === 'cursor' && r.path === '.cursor/skills/debugging/SKILL.md',
    );
    expect(skill).toBeDefined();
    expect(skill!.content).toContain('name: debugging');
    expect(skill!.content).toContain('description: Debug workflow');
    expect(skill!.content).toContain('# Debugging');
  });

  it('preserves rule frontmatter in global mode', async () => {
    const results = await generate({
      config: makeGlobalConfig(),
      canonical: makeCanonical({
        rules: [
          {
            source: '/proj/.agentsmesh/rules/ts.md',
            root: false,
            targets: [],
            description: 'TypeScript standards',
            globs: ['src/**/*.ts'],
            body: 'Use strict mode.',
          },
        ],
      }),
      projectRoot: TEST_DIR,
      scope: 'global',
    });

    const rule = results.find((r) => r.target === 'cursor' && r.path === '.cursor/rules/ts.mdc');
    expect(rule).toBeDefined();
    expect(rule!.content).toContain('description: TypeScript standards');
    expect(rule!.content).toContain('src/**/*.ts');
    expect(rule!.content).toContain('alwaysApply: false');
    expect(rule!.content).toContain('Use strict mode.');
  });

  it('preserves MCP content in global mode (written to .cursor/mcp.json)', async () => {
    const results = await generate({
      config: { ...makeGlobalConfig(), features: ['mcp'] } as ValidatedConfig,
      canonical: makeCanonical({
        mcp: {
          mcpServers: {
            'test-server': { type: 'stdio', command: 'npx', args: ['-y', '@test/mcp'], env: {} },
          },
        },
      }),
      projectRoot: TEST_DIR,
      scope: 'global',
    });

    const mcpFile = results.find((r) => r.target === 'cursor' && r.path === '.cursor/mcp.json');
    expect(mcpFile).toBeDefined();
    const parsed = JSON.parse(mcpFile!.content) as Record<string, unknown>;
    expect(parsed).toHaveProperty('mcpServers');
    const servers = parsed.mcpServers as Record<string, unknown>;
    expect(servers).toHaveProperty('test-server');
    const server = servers['test-server'] as Record<string, unknown>;
    expect(server.command).toBe('npx');
    expect(server.args).toEqual(['-y', '@test/mcp']);
  });

  it('preserves hooks configuration in global mode', async () => {
    const results = await generate({
      config: { ...makeGlobalConfig(), features: ['hooks'] } as ValidatedConfig,
      canonical: makeCanonical({
        hooks: {
          PreToolUse: [
            {
              matcher: 'Bash',
              type: 'command' as const,
              command: './scripts/validate.sh',
              timeout: 30,
            },
          ],
        },
      }),
      projectRoot: TEST_DIR,
      scope: 'global',
    });

    const hooksFile = results.find((r) => r.target === 'cursor' && r.path === '.cursor/hooks.json');
    expect(hooksFile).toBeDefined();
    const parsed = JSON.parse(hooksFile!.content) as Record<string, unknown>;
    expect(parsed).toHaveProperty('version', 1);
    expect(parsed).toHaveProperty('hooks');
    const hooksObj = parsed.hooks as Record<string, unknown>;
    // Cursor uses camelCase event names and a flat hook array.
    expect(hooksObj).toHaveProperty('preToolUse');
    expect(hooksObj).not.toHaveProperty('PreToolUse');
    const entries = hooksObj.preToolUse as Array<Record<string, unknown>>;
    expect(entries).toHaveLength(1);
    expect(entries[0]!.matcher).toBe('Bash');
    expect(entries[0]!.type).toBe('command');
    expect(entries[0]!.command).toBe('./scripts/validate.sh');
    expect(entries[0]!.timeout).toBe(30);
    expect(entries[0]).not.toHaveProperty('hooks');
  });

  it('emits permissions to .cursor/cli-config.json in global mode (not .cursor/cli.json)', async () => {
    // Global Cursor permissions use ~/.cursor/cli-config.json per
    // https://cursor.com/docs/cli/reference/permissions
    const results = await generate({
      config: { ...makeGlobalConfig(), features: ['permissions'] } as ValidatedConfig,
      canonical: makeCanonical({
        permissions: { allow: ['Read', 'Grep'], deny: ['WebFetch'] },
      }),
      projectRoot: TEST_DIR,
      scope: 'global',
    });

    const cliConfig = results.find(
      (r) => r.target === 'cursor' && r.path === '.cursor/cli-config.json',
    );
    expect(cliConfig).toBeDefined();
    const parsed = JSON.parse(cliConfig!.content) as Record<string, unknown>;
    expect(parsed).toHaveProperty('permissions');
    const perms = parsed.permissions as Record<string, unknown>;
    expect(perms.allow).toEqual(['Read', 'Grep']);
    expect(perms.deny).toEqual(['WebFetch']);

    // project-scope path must NOT be emitted in global mode
    const projectScopeFile = results.find(
      (r) => r.target === 'cursor' && r.path === '.cursor/cli.json',
    );
    expect(projectScopeFile).toBeUndefined();
  });
});
