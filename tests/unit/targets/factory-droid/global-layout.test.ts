import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getBuiltinTargetDefinition } from '../../../../src/targets/catalog/builtin-targets.js';
import { generate } from '../../../../src/core/generate/engine.js';
import type { ValidatedConfig } from '../../../../src/config/core/schema.js';
import type { CanonicalFiles } from '../../../../src/core/types.js';
import {
  FACTORY_DROID_ROOT_FILE,
  FACTORY_DROID_MCP_FILE,
  FACTORY_DROID_HOOKS_FILE,
  FACTORY_DROID_SETTINGS_FILE,
  FACTORY_DROID_SKILLS_DIR,
  FACTORY_DROID_DROIDS_DIR,
  FACTORY_DROID_GLOBAL_ROOT_FILE,
  FACTORY_DROID_GLOBAL_MCP_FILE,
  FACTORY_DROID_GLOBAL_HOOKS_FILE,
  FACTORY_DROID_GLOBAL_SETTINGS_FILE,
  FACTORY_DROID_GLOBAL_SKILLS_DIR,
  FACTORY_DROID_GLOBAL_DROIDS_DIR,
} from '../../../../src/targets/factory-droid/constants.js';

describe('factory-droid descriptor shape', () => {
  const descriptor = getBuiltinTargetDefinition('factory-droid')!;

  it('has id factory-droid', () => {
    expect(descriptor.id).toBe('factory-droid');
  });

  it('has capabilities', () => {
    expect(descriptor.capabilities.rules).toBe('native');
    expect(descriptor.capabilities.additionalRules).toBe('embedded');
    expect(descriptor.capabilities.commands).toBe('native');
    expect(descriptor.capabilities.agents).toBe('native');
    expect(descriptor.capabilities.skills).toBe('native');
    expect(descriptor.capabilities.mcp).toBe('native');
    expect(descriptor.capabilities.hooks).toBe('native');
    expect(descriptor.capabilities.ignore).toBe('none');
    expect(descriptor.capabilities.permissions).toBe('native');
  });

  it('has detection paths', () => {
    expect(descriptor.detectionPaths).toContain(FACTORY_DROID_ROOT_FILE);
    expect(descriptor.detectionPaths).toContain(FACTORY_DROID_MCP_FILE);
    expect(descriptor.detectionPaths).toContain(FACTORY_DROID_DROIDS_DIR);
  });

  it('emits native commands (no skill projection)', () => {
    expect(descriptor.supportsConversion).toBeUndefined();
    expect(descriptor.project.paths.commandPath('review', {} as never)).toBe(
      '.factory/commands/review.md',
    );
  });

  it('project layout has rootInstructionPath', () => {
    expect(descriptor.project.rootInstructionPath).toBe(FACTORY_DROID_ROOT_FILE);
  });

  it('project layout has skillDir', () => {
    expect(descriptor.project.skillDir).toBe(FACTORY_DROID_SKILLS_DIR);
  });

  // `droid` creates settings.json itself, `/hooks` saves hooks.json and
  // `droid mcp add` writes mcp.json, so all three are co-owned: agentsmesh
  // merges its keys in and never deletes them.
  it('project layout has managed outputs', () => {
    expect(descriptor.project.managedOutputs!.dirs).toContain(FACTORY_DROID_SKILLS_DIR);
    expect(descriptor.project.managedOutputs!.dirs).toContain(FACTORY_DROID_DROIDS_DIR);
    expect(descriptor.project.managedOutputs!.files).toContain(FACTORY_DROID_ROOT_FILE);
    expect(descriptor.project.managedOutputs!.coOwnedFiles).toEqual([
      FACTORY_DROID_HOOKS_FILE,
      FACTORY_DROID_SETTINGS_FILE,
      FACTORY_DROID_MCP_FILE,
    ]);
  });

  it('global layout co-owns the hooks, settings and mcp files', () => {
    const globalLayout = descriptor.globalSupport!.layout;
    expect(globalLayout.managedOutputs!.coOwnedFiles).toEqual([
      FACTORY_DROID_GLOBAL_HOOKS_FILE,
      FACTORY_DROID_GLOBAL_SETTINGS_FILE,
      FACTORY_DROID_GLOBAL_MCP_FILE,
    ]);
    expect(globalLayout.managedOutputs!.files).not.toContain(FACTORY_DROID_GLOBAL_MCP_FILE);
  });
});

describe('factory-droid global layout', () => {
  const descriptor = getBuiltinTargetDefinition('factory-droid')!;

  it('descriptor.globalSupport exists', () => {
    expect(descriptor.globalSupport).toBeDefined();
  });

  it('globalSupport has layout with rewriteGeneratedPath', () => {
    expect(descriptor.globalSupport!.layout.rewriteGeneratedPath).toBeDefined();
  });

  it('rewriteGeneratedPath transforms AGENTS.md to global path', () => {
    const rewrite = descriptor.globalSupport!.layout.rewriteGeneratedPath!;
    expect(rewrite(FACTORY_DROID_ROOT_FILE)).toBe(FACTORY_DROID_GLOBAL_ROOT_FILE);
  });

  it('rewriteGeneratedPath transforms .factory/mcp.json to global path', () => {
    const rewrite = descriptor.globalSupport!.layout.rewriteGeneratedPath!;
    expect(rewrite(FACTORY_DROID_MCP_FILE)).toBe(FACTORY_DROID_GLOBAL_MCP_FILE);
  });

  it('rewriteGeneratedPath transforms .factory/skills/ to global skills path', () => {
    const rewrite = descriptor.globalSupport!.layout.rewriteGeneratedPath!;
    const skillPath = `${FACTORY_DROID_SKILLS_DIR}/debugging/SKILL.md`;
    expect(rewrite(skillPath)).toBe(`${FACTORY_DROID_GLOBAL_SKILLS_DIR}/debugging/SKILL.md`);
  });

  it('rewriteGeneratedPath transforms .factory/droids/ to global droids path', () => {
    const rewrite = descriptor.globalSupport!.layout.rewriteGeneratedPath!;
    const droidPath = `${FACTORY_DROID_DROIDS_DIR}/security-auditor.md`;
    expect(rewrite(droidPath)).toBe(`${FACTORY_DROID_GLOBAL_DROIDS_DIR}/security-auditor.md`);
  });

  it('rewriteGeneratedPath passes through unrelated paths', () => {
    const rewrite = descriptor.globalSupport!.layout.rewriteGeneratedPath!;
    expect(rewrite('unrelated/file.md')).toBe('unrelated/file.md');
  });

  it('globalSupport.capabilities matches project capabilities', () => {
    expect(descriptor.globalSupport!.capabilities).toEqual(descriptor.capabilities);
  });

  it('globalSupport has detection paths', () => {
    expect(descriptor.globalSupport!.detectionPaths.length).toBeGreaterThan(0);
    expect(descriptor.globalSupport!.detectionPaths).toContain(FACTORY_DROID_GLOBAL_ROOT_FILE);
    expect(descriptor.globalSupport!.detectionPaths).toContain(FACTORY_DROID_GLOBAL_MCP_FILE);
  });
});

describe('factory-droid global frontmatter preservation', () => {
  const TEST_DIR = join(tmpdir(), 'am-factory-droid-global-fm');

  function makeGlobalConfig(): ValidatedConfig {
    return {
      version: 1,
      targets: ['factory-droid'],
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
      (r) =>
        r.target === 'factory-droid' &&
        r.path === `${FACTORY_DROID_GLOBAL_SKILLS_DIR}/debugging/SKILL.md`,
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

    const rule = results.find(
      (r) => r.target === 'factory-droid' && r.path === FACTORY_DROID_GLOBAL_ROOT_FILE,
    );
    expect(rule).toBeDefined();
    expect(rule!.content).toContain('Use TDD and strict TypeScript.');
  });

  it('preserves MCP configuration in global mode', async () => {
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
      (r) => r.target === 'factory-droid' && r.path === FACTORY_DROID_GLOBAL_MCP_FILE,
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
