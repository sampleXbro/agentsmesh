import { describe, it, expect, beforeEach } from 'vitest';
import type { TargetGenerators } from '../../../../src/targets/catalog/target.interface.js';
import type { TargetDescriptor } from '../../../../src/targets/catalog/target-descriptor.js';
import {
  registerTargetDescriptor,
  getAllDescriptors,
  resetRegistry,
} from '../../../../src/targets/catalog/registry.js';

function makeLegacyTarget(name: string): TargetGenerators {
  return {
    name,
    generateRules: () => [],
    importFrom: async () => [],
  };
}

function makeDescriptor(id: string): TargetDescriptor {
  return {
    id,
    metadata: {
      displayName: id,
      category: 'cli',
      officialUrl: 'https://example.test/',
      shortDescription: `Test descriptor for ${id}`,
    },
    generators: makeLegacyTarget(id),
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
    emptyImportMessage: `No ${id} config found.`,
    lintRules: null,
    project: {
      paths: {
        rulePath: (slug: string) => `.plugin/${slug}.md`,
        commandPath: () => null,
        agentPath: () => null,
      },
    },
    buildImportPaths: async () => {},
    detectionPaths: ['.plugin'],
  } as unknown as TargetDescriptor;
}

beforeEach(() => {
  resetRegistry();
});

describe('getAllDescriptors', () => {
  it('returns empty array when no plugin descriptors registered', () => {
    expect(getAllDescriptors()).toHaveLength(0);
  });

  it('returns all registered plugin descriptors', () => {
    const d1 = makeDescriptor('plugin-a');
    const d2 = makeDescriptor('plugin-b');
    registerTargetDescriptor(d1);
    registerTargetDescriptor(d2);
    const all = getAllDescriptors();
    expect(all.map((d) => d.id)).toContain('plugin-a');
    expect(all.map((d) => d.id)).toContain('plugin-b');
    expect(all).toHaveLength(2);
  });

  it('is cleared by resetRegistry', () => {
    registerTargetDescriptor(makeDescriptor('plugin-c'));
    resetRegistry();
    expect(getAllDescriptors()).toHaveLength(0);
  });

  it('validates descriptors before registration', () => {
    expect(() =>
      registerTargetDescriptor({
        ...makeDescriptor('invalid-plugin'),
        capabilities: {
          ...makeDescriptor('invalid-plugin').capabilities,
          commands: 'native',
        },
      }),
    ).toThrow(/generateCommands/);
    expect(getAllDescriptors()).toHaveLength(0);
  });
});

describe('builtin descriptor lookup (circular-import contract)', () => {
  it('every BUILTIN_TARGETS slot is populated after module init (no TDZ holes)', async () => {
    // Importing here (not at file top) keeps `resetRegistry()` from
    // affecting builtins — they live in the builtin map, not the plugin one.
    const { BUILTIN_TARGETS } = await import('../../../../src/targets/catalog/builtin-targets.js');
    expect(BUILTIN_TARGETS.length).toBeGreaterThan(0);
    for (let i = 0; i < BUILTIN_TARGETS.length; i++) {
      const descriptor = BUILTIN_TARGETS[i];
      // A TDZ hole here means a descriptor module imported `getDescriptor`
      // from `registry.ts` during its own init and the resulting cycle
      // froze undefined slots. See `.agentsmesh/lessons/journal.md:248` for the trap.
      expect(descriptor, `BUILTIN_TARGETS[${i}] should not be undefined`).toBeDefined();
      expect(typeof descriptor.id).toBe('string');
    }
  });

  it('getDescriptor resolves every builtin target id', async () => {
    const { TARGET_IDS } = await import('../../../../src/targets/catalog/target-ids.js');
    const { getDescriptor } = await import('../../../../src/targets/catalog/registry.js');
    for (const id of TARGET_IDS) {
      expect(getDescriptor(id), `getDescriptor("${id}") should return a descriptor`).toBeDefined();
    }
  });
});
