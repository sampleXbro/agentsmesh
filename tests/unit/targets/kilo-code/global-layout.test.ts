import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getBuiltinTargetDefinition,
  getTargetCapabilities,
  getTargetLayout,
} from '../../../../src/targets/catalog/builtin-targets.js';
import { generate } from '../../../../src/core/generate/engine.js';
import type { ValidatedConfig } from '../../../../src/config/core/schema.js';
import type { CanonicalFiles } from '../../../../src/core/types.js';
import {
  KILO_CODE_ROOT_RULE,
  KILO_CODE_MCP_FILE,
  KILO_CODE_IGNORE,
  KILO_CODE_GLOBAL_AGENTS_MD,
  KILO_CODE_GLOBAL_RULES_DIR,
  KILO_CODE_GLOBAL_COMMANDS_DIR,
  KILO_CODE_GLOBAL_AGENTS_DIR,
  KILO_CODE_GLOBAL_SKILLS_DIR,
  KILO_CONFIG_FILE,
  KILO_GLOBAL_CONFIG_FILE,
} from '../../../../src/targets/kilo-code/constants.js';

describe('kilo-code global layout — paths', () => {
  const layout = getTargetLayout('kilo-code', 'global')!;

  it('resolves rule path to .config/kilo/rules/', () => {
    expect(
      layout.paths.rulePath('typescript', {
        source: 'typescript.md',
        root: false,
        targets: [],
        description: '',
        globs: [],
        body: '',
      }),
    ).toBe(`${KILO_CODE_GLOBAL_RULES_DIR}/typescript.md`);
  });

  it('resolves command path to .config/kilo/commands/', () => {
    expect(layout.paths.commandPath('deploy', {} as never)).toBe(
      `${KILO_CODE_GLOBAL_COMMANDS_DIR}/deploy.md`,
    );
  });

  it('resolves agent path to .config/kilo/agents/', () => {
    expect(layout.paths.agentPath('reviewer', {} as never)).toBe(
      `${KILO_CODE_GLOBAL_AGENTS_DIR}/reviewer.md`,
    );
  });

  it('declares all global managed-output dirs', () => {
    expect(layout.managedOutputs.dirs).toEqual([
      KILO_CODE_GLOBAL_RULES_DIR,
      KILO_CODE_GLOBAL_COMMANDS_DIR,
      KILO_CODE_GLOBAL_AGENTS_DIR,
      KILO_CODE_GLOBAL_SKILLS_DIR,
      '.agents/skills',
    ]);
  });

  it('declares all global managed-output files (no standalone mcp.json or ignore file)', () => {
    expect(layout.managedOutputs.files).toEqual([KILO_CODE_GLOBAL_AGENTS_MD]);
    // Kilo's own settings file: co-owned, never stale-deleted.
    expect(layout.managedOutputs.coOwnedFiles).toEqual([KILO_GLOBAL_CONFIG_FILE]);
  });
});

describe('kilo-code global layout — rewriteGeneratedPath', () => {
  const layout = getTargetLayout('kilo-code', 'global')!;
  const rewrite = layout.rewriteGeneratedPath!;

  it('rewrites AGENTS.md to .config/kilo/AGENTS.md', () => {
    expect(rewrite(KILO_CODE_ROOT_RULE)).toBe(KILO_CODE_GLOBAL_AGENTS_MD);
  });

  it('rewrites .kilo/rules/ paths to .config/kilo/rules/', () => {
    expect(rewrite('.kilo/rules/typescript.md')).toBe(
      `${KILO_CODE_GLOBAL_RULES_DIR}/typescript.md`,
    );
  });

  it('rewrites .kilo/commands/ paths to .config/kilo/commands/', () => {
    expect(rewrite('.kilo/commands/deploy.md')).toBe(`${KILO_CODE_GLOBAL_COMMANDS_DIR}/deploy.md`);
  });

  it('rewrites .kilo/agents/ paths to .config/kilo/agents/', () => {
    expect(rewrite('.kilo/agents/reviewer.md')).toBe(`${KILO_CODE_GLOBAL_AGENTS_DIR}/reviewer.md`);
  });

  it('keeps .kilo/skills/ paths unchanged (documented global skill location)', () => {
    expect(rewrite(`${KILO_CODE_GLOBAL_SKILLS_DIR}/api-gen/SKILL.md`)).toBe(
      `${KILO_CODE_GLOBAL_SKILLS_DIR}/api-gen/SKILL.md`,
    );
  });

  it('suppresses .kilo/mcp.json — MCP folds into kilo.jsonc `mcp` key at global scope', () => {
    expect(rewrite(KILO_CODE_MCP_FILE)).toBeNull();
  });

  it('suppresses .kilocodeignore — no documented global ignore mechanism', () => {
    expect(rewrite(KILO_CODE_IGNORE)).toBeNull();
  });

  it('rewrites kilo.jsonc to .config/kilo/kilo.jsonc for global scope', () => {
    expect(rewrite(KILO_CONFIG_FILE)).toBe(KILO_GLOBAL_CONFIG_FILE);
  });

  it('leaves unrelated paths untouched', () => {
    expect(rewrite('some/other/path.md')).toBe('some/other/path.md');
  });
});

describe('kilo-code global layout — mirrorGlobalPath', () => {
  const layout = getTargetLayout('kilo-code', 'global')!;
  const mirror = layout.mirrorGlobalPath!;

  it('mirrors .kilo/skills/ to .agents/skills/', () => {
    expect(mirror(`${KILO_CODE_GLOBAL_SKILLS_DIR}/api-gen/SKILL.md`, [])).toBe(
      '.agents/skills/api-gen/SKILL.md',
    );
  });

  it('mirrors nested supporting file under .kilo/skills/', () => {
    expect(mirror(`${KILO_CODE_GLOBAL_SKILLS_DIR}/api-gen/references/checklist.md`, [])).toBe(
      '.agents/skills/api-gen/references/checklist.md',
    );
  });

  it('does not mirror when codex-cli is active', () => {
    expect(mirror(`${KILO_CODE_GLOBAL_SKILLS_DIR}/api-gen/SKILL.md`, ['codex-cli'])).toBeNull();
  });

  it('returns null for AGENTS.md (not mirrored)', () => {
    expect(mirror(KILO_CODE_GLOBAL_AGENTS_MD, [])).toBeNull();
  });

  it('returns null for command files (not mirrored)', () => {
    expect(mirror(`${KILO_CODE_GLOBAL_COMMANDS_DIR}/deploy.md`, [])).toBeNull();
  });

  it('returns null for agent files (not mirrored)', () => {
    expect(mirror(`${KILO_CODE_GLOBAL_AGENTS_DIR}/reviewer.md`, [])).toBeNull();
  });
});

describe('kilo-code global layout — capabilities', () => {
  it('downgrades ignore to none and hooks to partial at global scope', () => {
    expect(getTargetCapabilities('kilo-code', 'global')).toEqual({
      rules: { level: 'native' },
      additionalRules: { level: 'native' },
      commands: { level: 'native' },
      agents: { level: 'native' },
      skills: { level: 'native' },
      mcp: { level: 'native' },
      hooks: { level: 'none' },
      ignore: { level: 'none' },
      permissions: { level: 'native' },
    });
  });

  it('descriptor.globalSupport.detectionPaths covers all global locations (no standalone mcp/ignore files)', () => {
    const desc = getBuiltinTargetDefinition('kilo-code')!;
    const paths = desc.globalSupport?.detectionPaths ?? [];
    expect(paths).toEqual([
      KILO_CODE_GLOBAL_AGENTS_MD,
      KILO_CODE_GLOBAL_RULES_DIR,
      KILO_CODE_GLOBAL_COMMANDS_DIR,
      KILO_CODE_GLOBAL_AGENTS_DIR,
      KILO_CODE_GLOBAL_SKILLS_DIR,
      KILO_GLOBAL_CONFIG_FILE,
    ]);
  });
});

describe('kilo-code global frontmatter preservation', () => {
  const TEST_DIR = join(tmpdir(), 'am-kilo-code-global-fm');

  function makeGlobalConfig(features: string[]): ValidatedConfig {
    return {
      version: 1,
      targets: ['kilo-code'],
      features,
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
      config: makeGlobalConfig(['rules', 'skills']),
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
      (r) =>
        r.target === 'kilo-code' && r.path === `${KILO_CODE_GLOBAL_SKILLS_DIR}/debugging/SKILL.md`,
    );
    expect(skill).toBeDefined();
    expect(skill!.content).toContain('name: debugging');
    expect(skill!.content).toContain('description: Debug workflow');
    expect(skill!.content).toContain('# Debugging');
  });

  it('preserves rule frontmatter in global mode (written under .config/kilo/rules/)', async () => {
    const results = await generate({
      config: makeGlobalConfig(['rules']),
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

    const rule = results.find(
      (r) => r.target === 'kilo-code' && r.path === `${KILO_CODE_GLOBAL_RULES_DIR}/ts.md`,
    );
    expect(rule).toBeDefined();
    expect(rule!.content).toContain('description: TypeScript standards');
    expect(rule!.content).toContain('src/**/*.ts');
    expect(rule!.content).toContain('Use strict mode.');
  });

  it('registers non-root rules under the `instructions` key of the shared kilo.jsonc', async () => {
    // `emitScopedSettings` only runs when the engine's mcp/ignore/hooks/agents/
    // permissions gate fires (rules alone does not trigger it — see
    // src/core/generate/engine.ts and global-settings.ts); real generate runs
    // include `permissions` by default (VALID_FEATURES), so this reflects
    // realistic usage rather than an artificial isolated-feature scenario.
    const results = await generate({
      config: makeGlobalConfig(['rules', 'permissions']),
      canonical: makeCanonical({
        rules: [
          {
            source: '/proj/.agentsmesh/rules/ts.md',
            root: false,
            targets: [],
            description: '',
            globs: [],
            body: 'Use strict mode.',
          },
        ],
      }),
      projectRoot: TEST_DIR,
      scope: 'global',
    });

    const configFile = results.find(
      (r) => r.target === 'kilo-code' && r.path === KILO_GLOBAL_CONFIG_FILE,
    );
    expect(configFile).toBeDefined();
    const parsed = JSON.parse(configFile!.content) as Record<string, unknown>;
    expect(parsed.instructions).toEqual(['rules/*.md']);
  });

  it('does not register `instructions` when only a root rule is generated', async () => {
    const results = await generate({
      config: makeGlobalConfig(['rules', 'permissions']),
      canonical: makeCanonical({
        rules: [
          {
            source: '/proj/.agentsmesh/rules/_root.md',
            root: true,
            targets: [],
            description: '',
            globs: [],
            body: '# Root',
          },
        ],
      }),
      projectRoot: TEST_DIR,
      scope: 'global',
    });

    const configFile = results.find(
      (r) => r.target === 'kilo-code' && r.path === KILO_GLOBAL_CONFIG_FILE,
    );
    expect(configFile).toBeUndefined();
  });

  it('folds MCP servers into the `mcp` key of the shared kilo.jsonc (new type/command schema)', async () => {
    const results = await generate({
      config: makeGlobalConfig(['mcp']),
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

    // No standalone mcp.json is emitted at global scope.
    expect(results.some((r) => r.target === 'kilo-code' && r.path === KILO_CODE_MCP_FILE)).toBe(
      false,
    );

    const configFile = results.find(
      (r) => r.target === 'kilo-code' && r.path === KILO_GLOBAL_CONFIG_FILE,
    );
    expect(configFile).toBeDefined();
    const parsed = JSON.parse(configFile!.content) as { mcp: Record<string, unknown> };
    const server = parsed.mcp['test-server'] as Record<string, unknown>;
    expect(server.type).toBe('local');
    expect(server.command).toEqual(['npx', '-y', '@test/mcp']);
  });

  it('does not emit .kilocodeignore at global scope even when ignore patterns are set', async () => {
    const results = await generate({
      config: makeGlobalConfig(['ignore']),
      canonical: makeCanonical({ ignore: ['node_modules/', '.env'] }),
      projectRoot: TEST_DIR,
      scope: 'global',
    });

    expect(results.some((r) => r.target === 'kilo-code' && r.path === KILO_CODE_IGNORE)).toBe(
      false,
    );
  });
});
