import { describe, it, expect, beforeEach } from 'vitest';
import type { TargetDescriptor } from '../../../../src/targets/catalog/target-descriptor.js';
import type { ValidatedConfig } from '../../../../src/config/core/schema.js';
import {
  getTargetCapabilities,
  getTargetDetectionPaths,
  getTargetLayout,
  getBuiltinTargetDefinition,
  getEffectiveTargetSupportLevel,
  resolveTargetFeatureGenerator,
  rewriteGeneratedOutputPath,
} from '../../../../src/targets/catalog/builtin-targets.js';
import {
  registerTargetDescriptor,
  resetRegistry,
} from '../../../../src/targets/catalog/registry.js';

function makeMinimalDescriptor(
  id: string,
  overrides: Partial<TargetDescriptor> = {},
): TargetDescriptor {
  return {
    id,
    metadata: {
      displayName: id,
      category: 'cli',
      officialUrl: 'https://example.test/',
      shortDescription: `Test descriptor for ${id}`,
    },
    generators: { name: id, generateRules: () => [], importFrom: async () => [] },
    capabilities: {
      rules: 'native',
      additionalRules: 'none',
      commands: 'none',
      agents: 'none',
      skills: 'none',
      mcp: 'none',
      hooks: 'none',
      ignore: 'none',
      permissions: 'none',
    },
    emptyImportMessage: '',
    lintRules: null,
    project: {
      paths: { rulePath: (s: string) => s, commandPath: () => null, agentPath: () => null },
    },
    buildImportPaths: async () => {},
    detectionPaths: [],
    ...overrides,
  } as unknown as TargetDescriptor;
}

beforeEach(() => {
  resetRegistry();
});

describe('getBuiltinTargetDefinition', () => {
  it('returns descriptor for known builtin targets', () => {
    expect(getBuiltinTargetDefinition('copilot')).toBeDefined();
    expect(getBuiltinTargetDefinition('copilot')!.id).toBe('copilot');
  });

  it('returns undefined for unknown target id', () => {
    expect(getBuiltinTargetDefinition('nonexistent-target-xyz')).toBeUndefined();
  });
});

describe('getTargetCapabilities', () => {
  it('returns project capabilities in default (project) scope', () => {
    const caps = getTargetCapabilities('copilot', 'project');
    expect(caps).toBeDefined();
    expect(caps!.rules).toBeDefined();
  });

  it('returns global capabilities from globalSupport.capabilities when present', () => {
    const globalCaps = getTargetCapabilities('copilot', 'global');
    expect(globalCaps).toBeDefined();
    expect(globalCaps!.rules).toBeDefined();
  });

  it('reports all-none in global scope when globalSupport is absent (no project fallback)', () => {
    const desc = makeMinimalDescriptor('test-global-caps-fallback', {
      capabilities: {
        rules: 'partial',
        additionalRules: 'none',
        commands: 'none',
        agents: 'none',
        skills: 'none',
        mcp: 'none',
        hooks: 'none',
        ignore: 'none',
        permissions: 'none',
      },
    });
    registerTargetDescriptor(desc);
    const caps = getTargetCapabilities('test-global-caps-fallback', 'global');
    expect(caps).toBeDefined();
    for (const feature of [
      'rules',
      'additionalRules',
      'commands',
      'agents',
      'skills',
      'mcp',
      'hooks',
      'ignore',
      'permissions',
    ] as const) {
      expect(caps![feature]?.level).toBe('none');
    }
  });

  it('reports all-none in global scope for a rules-only target lacking globalSupport', () => {
    const desc = makeMinimalDescriptor('test-no-global-caps');
    registerTargetDescriptor(desc);
    const caps = getTargetCapabilities('test-no-global-caps', 'global');
    expect(caps).toBeDefined();
    expect(caps!.rules?.level).toBe('none');
  });

  it('jules reports all-none in global scope (cloud-only, no globalSupport)', () => {
    const caps = getTargetCapabilities('jules', 'global');
    expect(caps).toBeDefined();
    for (const feature of [
      'rules',
      'additionalRules',
      'commands',
      'agents',
      'skills',
      'mcp',
      'hooks',
      'ignore',
      'permissions',
    ] as const) {
      expect(caps![feature]?.level).toBe('none');
    }
  });

  it('replit-agent reports all-none in global scope (cloud-only, no globalSupport)', () => {
    const caps = getTargetCapabilities('replit-agent', 'global');
    expect(caps).toBeDefined();
    for (const feature of [
      'rules',
      'additionalRules',
      'commands',
      'agents',
      'skills',
      'mcp',
      'hooks',
      'ignore',
      'permissions',
    ] as const) {
      expect(caps![feature]?.level).toBe('none');
    }
  });

  it('claude-code global ignore embeds Read permission denies', () => {
    const caps = getTargetCapabilities('claude-code', 'global');
    expect(caps).toBeDefined();
    for (const feature of [
      'rules',
      'additionalRules',
      'commands',
      'agents',
      'skills',
      'mcp',
      'hooks',
      'ignore',
      'permissions',
    ] as const) {
      expect(caps![feature]?.level).toBe(feature === 'ignore' ? 'embedded' : 'native');
    }
  });

  it('returns undefined for completely unknown target', () => {
    expect(getTargetCapabilities('unknown-xyz', 'project')).toBeUndefined();
    expect(getTargetCapabilities('unknown-xyz', 'global')).toBeUndefined();
  });
});

describe('getTargetDetectionPaths', () => {
  it('returns project detection paths in project scope', () => {
    const paths = getTargetDetectionPaths('copilot', 'project');
    expect(paths.length).toBeGreaterThan(0);
  });

  it('returns global detection paths from globalSupport when present', () => {
    const paths = getTargetDetectionPaths('copilot', 'global');
    expect(paths.length).toBeGreaterThan(0);
  });

  it('returns global detection paths from globalSupport only', () => {
    const desc = makeMinimalDescriptor('test-det-paths-fallback', {
      globalSupport: {
        capabilities: {
          rules: 'native',
          additionalRules: 'none',
          commands: 'none',
          agents: 'none',
          skills: 'none',
          mcp: 'none',
          hooks: 'none',
          ignore: 'none',
          permissions: 'none',
        },
        detectionPaths: ['~/.test-tool/config'],
        layout: {
          paths: { rulePath: (s: string) => s, commandPath: () => null, agentPath: () => null },
        },
      },
    });
    registerTargetDescriptor(desc);
    const paths = getTargetDetectionPaths('test-det-paths-fallback', 'global');
    expect(paths).toContain('~/.test-tool/config');
  });

  it('returns empty array for global scope when no global detection paths defined', () => {
    const desc = makeMinimalDescriptor('test-no-det-paths');
    registerTargetDescriptor(desc);
    expect(getTargetDetectionPaths('test-no-det-paths', 'global')).toEqual([]);
  });

  it('returns empty array for unknown target', () => {
    expect(getTargetDetectionPaths('unknown-xyz', 'global')).toEqual([]);
  });
});

describe('getTargetLayout', () => {
  it('returns project layout in project scope', () => {
    expect(getTargetLayout('copilot', 'project')).toBeDefined();
  });

  it('returns global layout from globalSupport when present', () => {
    const layout = getTargetLayout('copilot', 'global');
    expect(layout).toBeDefined();
  });

  it('returns undefined for global layout when globalSupport is absent', () => {
    const fakeLayout = {
      paths: { rulePath: (s: string) => s, commandPath: () => null, agentPath: () => null },
    };
    const desc = makeMinimalDescriptor('test-global-layout-fallback');
    registerTargetDescriptor(desc);
    void fakeLayout;
    expect(getTargetLayout('test-global-layout-fallback', 'global')).toBeUndefined();
  });

  it('returns undefined for unknown target', () => {
    expect(getTargetLayout('unknown-xyz', 'project')).toBeUndefined();
    expect(getTargetLayout('unknown-xyz', 'global')).toBeUndefined();
  });
});

describe('rewriteGeneratedOutputPath', () => {
  it('returns null when target has no layout', () => {
    expect(rewriteGeneratedOutputPath('unknown-xyz', 'some/path.md', 'project')).toBeNull();
  });

  it('returns path unchanged when no rewriteGeneratedPath function defined', () => {
    const desc = makeMinimalDescriptor('test-no-rewrite');
    registerTargetDescriptor(desc);
    expect(rewriteGeneratedOutputPath('test-no-rewrite', 'rules/test.md', 'project')).toBe(
      'rules/test.md',
    );
  });
});

describe('capability resolution lockstep (gap #5 — single conversion guard)', () => {
  function configWithAgentsConversion(target: string, value: boolean): ValidatedConfig {
    return {
      version: 1,
      targets: [target],
      features: ['rules', 'agents'],
      extends: [],
      overrides: {},
      collaboration: { strategy: 'merge', lock_features: [] },
      conversions: { agents_to_skills: { [target]: value } },
    } as unknown as ValidatedConfig;
  }

  it('cline agents: support level and generator agree when conversion is disabled', () => {
    const config = configWithAgentsConversion('cline', false);
    expect(getEffectiveTargetSupportLevel('cline', 'agents', config)).toBe('native');
    expect(resolveTargetFeatureGenerator('cline', 'agents', config)).toBeDefined();
  });

  it('cline agents: support level and generator agree when conversion is enabled', () => {
    const config = configWithAgentsConversion('cline', true);
    expect(getEffectiveTargetSupportLevel('cline', 'agents', config)).toBe('native');
    expect(resolveTargetFeatureGenerator('cline', 'agents', config)).toBeDefined();
  });

  it('codex-cli commands: support level and generator agree when conversion is disabled', () => {
    const config = {
      version: 1,
      targets: ['codex-cli'],
      features: ['rules', 'commands'],
      extends: [],
      overrides: {},
      collaboration: { strategy: 'merge', lock_features: [] },
      conversions: { commands_to_skills: { 'codex-cli': false } },
    } as unknown as ValidatedConfig;
    expect(getEffectiveTargetSupportLevel('codex-cli', 'commands', config)).toBe('none');
    expect(resolveTargetFeatureGenerator('codex-cli', 'commands', config)).toBeUndefined();
  });
});

describe('getEffectiveTargetSupportLevel in global scope (no globalSupport => none)', () => {
  function baseConfig(target: string): ValidatedConfig {
    return {
      version: 1,
      targets: [target],
      features: ['rules', 'agents', 'commands', 'skills'],
      extends: [],
      overrides: {},
      collaboration: { strategy: 'merge', lock_features: [] },
      conversions: {},
    } as unknown as ValidatedConfig;
  }

  it('jules: every feature is none in global scope', () => {
    const config = baseConfig('jules');
    for (const feature of [
      'rules',
      'additionalRules',
      'commands',
      'agents',
      'skills',
      'mcp',
      'hooks',
      'ignore',
      'permissions',
    ] as const) {
      expect(getEffectiveTargetSupportLevel('jules', feature, config, 'global')).toBe('none');
    }
  });

  it('replit-agent: every feature is none in global scope (no conversion upgrade)', () => {
    const config = baseConfig('replit-agent');
    for (const feature of [
      'rules',
      'additionalRules',
      'commands',
      'agents',
      'skills',
      'mcp',
      'hooks',
      'ignore',
      'permissions',
    ] as const) {
      expect(getEffectiveTargetSupportLevel('replit-agent', feature, config, 'global')).toBe(
        'none',
      );
    }
  });

  it('jules: rules is native in project scope (unaffected by global fix)', () => {
    const config = baseConfig('jules');
    expect(getEffectiveTargetSupportLevel('jules', 'rules', config, 'project')).toBe('native');
  });

  it('claude-code: rules stays native in global scope (has globalSupport)', () => {
    const config = baseConfig('claude-code');
    expect(getEffectiveTargetSupportLevel('claude-code', 'rules', config, 'global')).toBe('native');
  });
});
