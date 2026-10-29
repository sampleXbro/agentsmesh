import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as yamlParse } from 'yaml';
import { getBuiltinTargetDefinition } from '../../../../src/targets/catalog/builtin-targets.js';
import { generate } from '../../../../src/core/generate/engine.js';
import type { ValidatedConfig } from '../../../../src/config/core/schema.js';
import type { CanonicalFiles } from '../../../../src/core/types.js';
import {
  ROVODEV_ROOT_FILE,
  ROVODEV_SKILLS_DIR,
  ROVODEV_COMMANDS_DIR,
  ROVODEV_PROMPTS_FILE,
  ROVODEV_GLOBAL_DIR,
  ROVODEV_GLOBAL_ROOT_FILE,
  ROVODEV_GLOBAL_SKILLS_DIR,
  ROVODEV_GLOBAL_COMMANDS_DIR,
  ROVODEV_GLOBAL_PROMPTS_FILE,
  ROVODEV_GLOBAL_MCP_FILE,
  ROVODEV_GLOBAL_CONFIG_FILE,
} from '../../../../src/targets/rovodev/constants.js';

describe('rovodev global layout', () => {
  const descriptor = getBuiltinTargetDefinition('rovodev')!;

  it('descriptor.globalSupport exists', () => {
    expect(descriptor.globalSupport).toBeDefined();
  });

  it('globalSupport has layout with rewriteGeneratedPath', () => {
    expect(descriptor.globalSupport!.layout.rewriteGeneratedPath).toBeDefined();
  });

  it('rewriteGeneratedPath transforms AGENTS.md to global path', () => {
    const rewrite = descriptor.globalSupport!.layout.rewriteGeneratedPath!;
    expect(rewrite(ROVODEV_ROOT_FILE)).toBe(ROVODEV_GLOBAL_ROOT_FILE);
  });

  it('rewriteGeneratedPath transforms .rovodev/skills/ to global skills path', () => {
    const rewrite = descriptor.globalSupport!.layout.rewriteGeneratedPath!;
    const skillPath = `${ROVODEV_SKILLS_DIR}/debugging/SKILL.md`;
    expect(rewrite(skillPath)).toBe(`${ROVODEV_GLOBAL_SKILLS_DIR}/debugging/SKILL.md`);
  });

  it('rewriteGeneratedPath transforms .rovodev/prompts.yml to the global prompts path', () => {
    const rewrite = descriptor.globalSupport!.layout.rewriteGeneratedPath!;
    expect(rewrite(ROVODEV_PROMPTS_FILE)).toBe(ROVODEV_GLOBAL_PROMPTS_FILE);
  });

  it('rewriteGeneratedPath transforms .rovodev/commands/ to the global commands path', () => {
    const rewrite = descriptor.globalSupport!.layout.rewriteGeneratedPath!;
    const commandPath = `${ROVODEV_COMMANDS_DIR}/review.md`;
    expect(rewrite(commandPath)).toBe(`${ROVODEV_GLOBAL_COMMANDS_DIR}/review.md`);
  });

  it('rewriteGeneratedPath passes through unknown paths', () => {
    const rewrite = descriptor.globalSupport!.layout.rewriteGeneratedPath!;
    expect(rewrite('some/other/path.md')).toBe('some/other/path.md');
  });

  it('globalSupport.capabilities matches project capabilities', () => {
    expect(descriptor.globalSupport!.capabilities.rules).toBe('native');
    expect(descriptor.globalSupport!.capabilities.skills).toBe('native');
    expect(descriptor.globalSupport!.capabilities.commands).toBe('native');
    expect(descriptor.globalSupport!.capabilities.mcp).toBe('native');
  });

  it('globalSupport.capabilities has embedded agents', () => {
    expect(descriptor.globalSupport!.capabilities.agents).toBe('native');
  });

  it('globalSupport.capabilities has partial ignore', () => {
    expect(descriptor.globalSupport!.capabilities.ignore).toBe('none');
  });

  it('globalSupport.capabilities supports hooks and permissions natively', () => {
    expect(descriptor.globalSupport!.capabilities.hooks).toBe('partial');
    expect(descriptor.globalSupport!.capabilities.permissions).toBe('native');
  });

  it('globalSupport has detection paths', () => {
    expect(descriptor.globalSupport!.detectionPaths.length).toBeGreaterThan(0);
    expect(descriptor.globalSupport!.detectionPaths).toContain(ROVODEV_GLOBAL_DIR);
    expect(descriptor.globalSupport!.detectionPaths).toContain(ROVODEV_GLOBAL_ROOT_FILE);
    expect(descriptor.globalSupport!.detectionPaths).toContain(ROVODEV_GLOBAL_SKILLS_DIR);
  });

  it('descriptor supports conversion for agents only (commands is native)', () => {
    expect(descriptor.supportsConversion).toBeUndefined();
  });

  it('project layout has correct rootInstructionPath', () => {
    expect(descriptor.project.rootInstructionPath).toBe(ROVODEV_ROOT_FILE);
  });

  it('project layout has correct skillDir', () => {
    expect(descriptor.project.skillDir).toBe(ROVODEV_SKILLS_DIR);
  });

  it('project layout managedOutputs includes all paths', () => {
    expect(descriptor.project.managedOutputs!.dirs).toContain(ROVODEV_SKILLS_DIR);
    expect(descriptor.project.managedOutputs!.dirs).toContain(ROVODEV_COMMANDS_DIR);
    expect(descriptor.project.managedOutputs!.files).toContain(ROVODEV_ROOT_FILE);
    // Co-owned: the user authors prompts in the manifest, so it is never deleted.
    expect(descriptor.project.managedOutputs!.coOwnedFiles).toContain(ROVODEV_PROMPTS_FILE);
  });

  it('global layout has correct rootInstructionPath', () => {
    expect(descriptor.globalSupport!.layout.rootInstructionPath).toBe(ROVODEV_GLOBAL_ROOT_FILE);
  });

  it('global layout has correct skillDir', () => {
    expect(descriptor.globalSupport!.layout.skillDir).toBe(ROVODEV_GLOBAL_SKILLS_DIR);
  });

  it('global layout managedOutputs includes all paths', () => {
    expect(descriptor.globalSupport!.layout.managedOutputs!.dirs).toContain(
      ROVODEV_GLOBAL_SKILLS_DIR,
    );
    expect(descriptor.globalSupport!.layout.managedOutputs!.dirs).toContain(
      ROVODEV_GLOBAL_COMMANDS_DIR,
    );
    expect(descriptor.globalSupport!.layout.managedOutputs!.files).toContain(
      ROVODEV_GLOBAL_ROOT_FILE,
    );
    expect(descriptor.globalSupport!.layout.managedOutputs!.coOwnedFiles).toContain(
      ROVODEV_GLOBAL_PROMPTS_FILE,
    );
    // Co-owned: Rovo Dev's documented settings file and the MCP config the CLI
    // manages — never stale-deleted.
    expect(descriptor.globalSupport!.layout.managedOutputs!.coOwnedFiles).toEqual([
      ROVODEV_GLOBAL_CONFIG_FILE,
      ROVODEV_GLOBAL_MCP_FILE,
      ROVODEV_GLOBAL_PROMPTS_FILE,
    ]);
    expect(descriptor.globalSupport!.layout.managedOutputs!.files).not.toContain(
      ROVODEV_GLOBAL_MCP_FILE,
    );
  });

  it('detection paths include project-level paths', () => {
    expect(descriptor.detectionPaths).toContain(ROVODEV_ROOT_FILE);
    expect(descriptor.detectionPaths).toContain(ROVODEV_SKILLS_DIR);
    expect(descriptor.detectionPaths).toContain(ROVODEV_PROMPTS_FILE);
  });

  it('mirrorGlobalPath mirrors skills to .agents/skills/', () => {
    const mirror = descriptor.globalSupport!.layout.mirrorGlobalPath!;
    const result = mirror(`${ROVODEV_GLOBAL_SKILLS_DIR}/debugging/SKILL.md`, ['rovodev']);
    expect(result).toBe('.agents/skills/debugging/SKILL.md');
  });

  it('mirrorGlobalPath suppresses mirror when codex-cli is active', () => {
    const mirror = descriptor.globalSupport!.layout.mirrorGlobalPath!;
    const result = mirror(`${ROVODEV_GLOBAL_SKILLS_DIR}/debugging/SKILL.md`, [
      'rovodev',
      'codex-cli',
    ]);
    expect(result).toBeNull();
  });

  it('mirrorGlobalPath returns null for non-skill paths', () => {
    const mirror = descriptor.globalSupport!.layout.mirrorGlobalPath!;
    const result = mirror('some/other/path.md', ['rovodev']);
    expect(result).toBeNull();
  });
});

describe('rovodev global frontmatter preservation', () => {
  const TEST_DIR = join(tmpdir(), 'am-rovodev-global-fm');

  function makeGlobalConfig(): ValidatedConfig {
    return {
      version: 1,
      targets: ['rovodev'],
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

  it('preserves embedded skill frontmatter in global mode', async () => {
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
      (r) => r.target === 'rovodev' && r.path === `${ROVODEV_GLOBAL_SKILLS_DIR}/debugging/SKILL.md`,
    );
    expect(skill).toBeDefined();
    expect(skill!.content).toContain('name: debugging');
    expect(skill!.content).toContain('description: Debug workflow');
    expect(skill!.content).toContain('# Debugging');
  });

  it('preserves rule body content in global mode', async () => {
    const results = await generate({
      config: makeGlobalConfig(),
      canonical: makeCanonical({
        rules: [
          {
            source: '/proj/.agentsmesh/rules/_root.md',
            root: true,
            targets: [],
            description: '',
            globs: [],
            body: 'Use TDD and strict TypeScript.',
          },
        ],
      }),
      projectRoot: TEST_DIR,
      scope: 'global',
    });

    const rule = results.find((r) => r.target === 'rovodev' && r.path === ROVODEV_GLOBAL_ROOT_FILE);
    expect(rule).toBeDefined();
    expect(rule!.content).toContain('Use TDD and strict TypeScript.');
  });

  it('preserves MCP content in global mode (written to .rovodev/mcp_config.json with mcpServers key)', async () => {
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

    const mcpFile = results.find(
      (r) => r.target === 'rovodev' && r.path === ROVODEV_GLOBAL_MCP_FILE,
    );
    expect(mcpFile).toBeDefined();
    const parsed = JSON.parse(mcpFile!.content) as Record<string, unknown>;
    expect(parsed).toHaveProperty('mcpServers');
    const servers = parsed.mcpServers as Record<string, unknown>;
    expect(servers).toHaveProperty('test-server');
    const server = servers['test-server'] as Record<string, unknown>;
    expect(server.command).toBe('npx');
    expect(server.args).toEqual(['-y', '@test/mcp']);
  });
});

describe('rovodev emitScopedSettings', () => {
  const descriptor = getBuiltinTargetDefinition('rovodev')!;

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

  it('returns [] for project scope', () => {
    const canonical = makeCanonical({
      hooks: { preGenerate: [{ command: 'echo hi' }] },
    });
    const result = descriptor.emitScopedSettings!(canonical, 'project', new Set(['hooks']));
    expect(result).toHaveLength(0);
  });

  it('returns [] for global scope with no hooks or permissions', () => {
    const canonical = makeCanonical();
    const result = descriptor.emitScopedSettings!(
      canonical,
      'global',
      new Set(['hooks', 'permissions']),
    );
    expect(result).toHaveLength(0);
  });

  it('returns [] for global scope with empty hooks arrays', () => {
    const canonical = makeCanonical({ hooks: { preGenerate: [], postGenerate: [] } });
    const result = descriptor.emitScopedSettings!(canonical, 'global', new Set(['hooks']));
    expect(result).toHaveLength(0);
  });

  it('returns [] for global scope with empty permissions', () => {
    const canonical = makeCanonical({ permissions: { allow: [], deny: [], ask: [] } });
    const result = descriptor.emitScopedSettings!(canonical, 'global', new Set(['permissions']));
    expect(result).toHaveLength(0);
  });

  it('does not emit unsupported config.yml eventHooks', () => {
    const canonical = makeCanonical({
      hooks: { preGenerate: [{ command: 'echo pre' }] },
    });
    const result = descriptor.emitScopedSettings!(canonical, 'global', new Set(['hooks']));
    expect(result).toEqual([]);
  });

  it('emits config.yml with toolPermissions when permissions present', () => {
    const canonical = makeCanonical({
      permissions: { allow: ['Read'], deny: [], ask: [] },
    });
    const result = descriptor.emitScopedSettings!(canonical, 'global', new Set(['permissions']));
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe(ROVODEV_GLOBAL_CONFIG_FILE);
    const parsed = yamlParse(result[0].content) as Record<string, unknown>;
    expect(parsed).toHaveProperty('toolPermissions');
    expect(parsed).not.toHaveProperty('eventHooks');
    const perms = parsed.toolPermissions as { tools: Record<string, unknown> };
    expect(perms.tools.Read).toBe('allow');
  });

  it('emits config.yml with both sections when both present', () => {
    const canonical = makeCanonical({
      hooks: { preGenerate: [{ command: 'echo pre' }] },
      permissions: { allow: ['Bash(**)'], deny: ['rm(**)', 'sudo'], ask: [] },
    });
    const result = descriptor.emitScopedSettings!(
      canonical,
      'global',
      new Set(['hooks', 'permissions']),
    );
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe(ROVODEV_GLOBAL_CONFIG_FILE);
    const parsed = yamlParse(result[0].content) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty('eventHooks');
    expect(parsed).toHaveProperty('toolPermissions');
  });

  it('respects disabled features — no hooks emitted when feature disabled', () => {
    const canonical = makeCanonical({
      hooks: { preGenerate: [{ command: 'echo pre' }] },
      permissions: { allow: ['Bash(**)'], deny: [], ask: [] },
    });
    const result = descriptor.emitScopedSettings!(canonical, 'global', new Set(['permissions']));
    expect(result).toHaveLength(1);
    const parsed = yamlParse(result[0].content) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty('eventHooks');
    expect(parsed).toHaveProperty('toolPermissions');
  });
});
