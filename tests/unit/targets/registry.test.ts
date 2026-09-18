import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerTargetDescriptor,
  getDescriptor,
  getAllDescriptors,
  resetRegistry,
} from '../../../src/targets/catalog/registry.js';
import { TARGET_IDS } from '../../../src/targets/catalog/target-ids.js';
import type { TargetGenerators } from '../../../src/targets/catalog/target.interface.js';
import type { TargetDescriptor } from '../../../src/targets/catalog/target-descriptor.js';
import type { CanonicalFiles } from '../../../src/core/types.js';

const mockGenerators: TargetGenerators = {
  name: 'test-target',
  generateRules: (_c: CanonicalFiles) => [],
  importFrom: async () => [],
};

const mockPathResolvers = {
  rulePath: (slug: string) => `.plugin/rules/${slug}.md`,
  commandPath: () => null,
  agentPath: () => null,
} as const;

const mockDescriptor: TargetDescriptor = {
  id: 'plugin-target',
  metadata: {
    displayName: 'Plugin Target',
    category: 'cli',
    officialUrl: 'https://example.test/plugin-target',
    shortDescription: 'Mock plugin descriptor used for registry tests',
  },
  generators: mockGenerators,
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
  emptyImportMessage: 'No plugin config found.',
  lintRules: null,
  project: {
    paths: mockPathResolvers,
  },
  buildImportPaths: async () => {},
  detectionPaths: ['.plugin'],
};

describe('target registry', () => {
  beforeEach(() => {
    resetRegistry();
  });

  it('exposes built-in targets without manual registration', () => {
    expect(getDescriptor('claude-code')?.generators.primaryRootInstructionPath).toBe('CLAUDE.md');
  });

  it('registers and retrieves a full descriptor', () => {
    registerTargetDescriptor(mockDescriptor);
    expect(getDescriptor('plugin-target')).toMatchObject({
      id: 'plugin-target',
      emptyImportMessage: 'No plugin config found.',
    });
  });

  it('getDescriptor resolves generators from registered descriptor', () => {
    registerTargetDescriptor(mockDescriptor);
    expect(getDescriptor('plugin-target')?.generators.name).toBe(mockGenerators.name);
  });

  it('getDescriptor returns built-in descriptors', () => {
    const claude = getDescriptor('claude-code');
    expect(claude).toBeDefined();
    expect(claude?.capabilities.rules).toBe('native');
    expect(claude?.detectionPaths).toContain('CLAUDE.md');
  });

  it('getDescriptor returns undefined for unknown target', () => {
    expect(getDescriptor('nonexistent')).toBeUndefined();
  });

  it('getAllDescriptors returns only plugin descriptors', () => {
    registerTargetDescriptor(mockDescriptor);
    expect(getAllDescriptors()).toHaveLength(1);
    expect(getAllDescriptors()[0]?.id).toBe('plugin-target');
  });

  it('resetRegistry clears descriptors too', () => {
    registerTargetDescriptor(mockDescriptor);
    resetRegistry();
    expect(getAllDescriptors()).toHaveLength(0);
  });

  it('plugin descriptor overrides built-in for getDescriptor', () => {
    const override: TargetDescriptor = {
      ...mockDescriptor,
      id: 'claude-code',
      emptyImportMessage: 'Custom plugin override.',
    };
    registerTargetDescriptor(override);
    expect(getDescriptor('claude-code')?.emptyImportMessage).toBe('Custom plugin override.');
  });

  it('plugin descriptor mock has required project layout field', () => {
    expect(mockDescriptor.project).toBeDefined();
    expect(typeof mockDescriptor.project.paths.rulePath).toBe('function');
  });
});

describe('builtin target invariants', () => {
  it.each(TARGET_IDS)(
    'target %s has globalSupport.detectionPaths when globalSupport is set',
    (id) => {
      const desc = getDescriptor(id);
      if (desc?.globalSupport) {
        expect(desc.globalSupport.detectionPaths).toBeDefined();
        expect(desc.globalSupport.detectionPaths.length).toBeGreaterThan(0);
      }
    },
  );

  it.each(TARGET_IDS)('target %s has non-empty detectionPaths', (id) => {
    const desc = getDescriptor(id);
    expect(desc?.detectionPaths).toBeDefined();
    expect(desc!.detectionPaths.length).toBeGreaterThan(0);
  });

  it.each(TARGET_IDS)('target %s has a non-empty emptyImportMessage', (id) => {
    const desc = getDescriptor(id);
    expect(typeof desc?.emptyImportMessage).toBe('string');
    expect(desc!.emptyImportMessage.length).toBeGreaterThan(0);
  });
});
