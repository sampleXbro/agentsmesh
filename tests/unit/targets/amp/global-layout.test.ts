import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getBuiltinTargetDefinition } from '../../../../src/targets/catalog/builtin-targets.js';
import { generate } from '../../../../src/core/generate/engine.js';
import type { ValidatedConfig } from '../../../../src/config/core/schema.js';
import type { CanonicalFiles } from '../../../../src/core/types.js';
import {
  AMP_ROOT_FILE,
  AMP_MCP_FILE,
  AMP_SKILLS_DIR,
  AMP_GLOBAL_ROOT_FILE,
  AMP_GLOBAL_MCP_FILE,
  AMP_GLOBAL_SKILLS_DIR,
} from '../../../../src/targets/amp/constants.js';

describe('amp global layout', () => {
  const descriptor = getBuiltinTargetDefinition('amp')!;

  it('descriptor.globalSupport exists', () => {
    expect(descriptor.globalSupport).toBeDefined();
  });

  it('globalSupport has layout with rewriteGeneratedPath', () => {
    expect(descriptor.globalSupport!.layout.rewriteGeneratedPath).toBeDefined();
  });

  it('rewriteGeneratedPath transforms AGENTS.md to global path', () => {
    const rewrite = descriptor.globalSupport!.layout.rewriteGeneratedPath!;
    expect(rewrite(AMP_ROOT_FILE)).toBe(AMP_GLOBAL_ROOT_FILE);
  });

  it('rewriteGeneratedPath transforms .amp/settings.json to global path', () => {
    const rewrite = descriptor.globalSupport!.layout.rewriteGeneratedPath!;
    expect(rewrite(AMP_MCP_FILE)).toBe(AMP_GLOBAL_MCP_FILE);
  });

  it('rewriteGeneratedPath transforms .agents/skills/ to global skills path', () => {
    const rewrite = descriptor.globalSupport!.layout.rewriteGeneratedPath!;
    const skillPath = `${AMP_SKILLS_DIR}/debugging/SKILL.md`;
    expect(rewrite(skillPath)).toBe(`${AMP_GLOBAL_SKILLS_DIR}/debugging/SKILL.md`);
  });

  it('globalSupport.capabilities matches project capabilities', () => {
    expect(descriptor.globalSupport!.capabilities).toEqual(descriptor.capabilities);
  });

  // Amp has no declarative slash-command file format (ampcode.com/manual):
  // commands only exist via `amp.registerCommand(...)` inside a TypeScript
  // plugin. AgentsMesh projects commands as skills, so the honest ceiling is
  // 'embedded' (routes through the already-native skills surface), not 'native'.
  it('commands capability is embedded (routed through the native skills surface), project + global', () => {
    expect(descriptor.capabilities.commands).toBe('embedded');
    expect(descriptor.globalSupport!.capabilities.commands).toBe('embedded');
  });

  it('hooks capability is partial, project + global', () => {
    expect(descriptor.capabilities.hooks).toBe('partial');
    expect(descriptor.globalSupport!.capabilities.hooks).toBe('partial');
  });

  it('agents capability is embedded (projected through native skills surface), project + global', () => {
    expect(descriptor.capabilities.agents).toBe('embedded');
    expect(descriptor.globalSupport!.capabilities.agents).toBe('embedded');
  });

  it('ignore capability is none (no dedicated ignore file; lintIgnore warns), project + global', () => {
    expect(descriptor.capabilities.ignore).toBe('none');
    expect(descriptor.globalSupport!.capabilities.ignore).toBe('none');
  });

  it('permissions capability is partial (amp.permissions is legacy; format mismatch prevents native claim), project + global', () => {
    expect(descriptor.capabilities.permissions).toBe('partial');
    expect(descriptor.globalSupport!.capabilities.permissions).toBe('partial');
  });

  it('globalSupport has detection paths', () => {
    expect(descriptor.globalSupport!.detectionPaths.length).toBeGreaterThan(0);
    expect(descriptor.globalSupport!.detectionPaths).toContain(AMP_GLOBAL_ROOT_FILE);
    expect(descriptor.globalSupport!.detectionPaths).toContain(AMP_GLOBAL_MCP_FILE);
  });

  it('descriptor declares shared artifacts as consumer', () => {
    expect(descriptor.sharedArtifacts).toEqual({ '.agents/skills/': 'consumer' });
  });

  it('descriptor supports conversion for commands and agents', () => {
    expect(descriptor.supportsConversion).toEqual({ commands: true, agents: true });
  });
});

describe('amp global frontmatter preservation', () => {
  const TEST_DIR = join(tmpdir(), 'am-amp-global-fm');

  function makeGlobalConfig(): ValidatedConfig {
    return {
      version: 1,
      targets: ['amp'],
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
      (r) => r.target === 'amp' && r.path === `${AMP_GLOBAL_SKILLS_DIR}/debugging/SKILL.md`,
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

    const rule = results.find((r) => r.target === 'amp' && r.path === AMP_GLOBAL_ROOT_FILE);
    expect(rule).toBeDefined();
    expect(rule!.content).toContain('Use TDD and strict TypeScript.');
  });

  it('preserves MCP content in global mode (written to .config/amp/settings.json with amp.mcpServers key)', async () => {
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

    const mcpFile = results.find((r) => r.target === 'amp' && r.path === AMP_GLOBAL_MCP_FILE);
    expect(mcpFile).toBeDefined();
    const parsed = JSON.parse(mcpFile!.content) as Record<string, unknown>;
    expect(parsed).toHaveProperty('amp.mcpServers');
    const servers = parsed['amp.mcpServers'] as Record<string, unknown>;
    expect(servers).toHaveProperty('test-server');
    const server = servers['test-server'] as Record<string, unknown>;
    expect(server.command).toBe('npx');
    expect(server.args).toEqual(['-y', '@test/mcp']);
  });
});
