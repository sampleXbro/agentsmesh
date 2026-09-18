import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import {
  registerTargetDescriptor,
  resetRegistry,
  getDescriptor,
} from '../../../../src/targets/catalog/registry.js';
import type {
  TargetDescriptor,
  TargetLayout,
} from '../../../../src/targets/catalog/target-descriptor.js';
import type { TargetGenerators } from '../../../../src/targets/catalog/target.interface.js';
import type { CanonicalFiles } from '../../../../src/core/types.js';

const PLUGIN_ID = 'plugin-contract-target';

const project: TargetLayout = {
  rootInstructionPath: '.plugin/rules/_root.md',
  skillDir: '.plugin/skills',
  rewriteGeneratedPath: (p) => p,
  paths: {
    rulePath: (slug) => `.plugin/rules/${slug}.md`,
    commandPath: () => null,
    agentPath: () => null,
  },
};

const pluginGenerators: TargetGenerators = {
  name: PLUGIN_ID,
  generateRules: (canonical: CanonicalFiles) => {
    const root = canonical.rules.find((r) => r.root);
    if (!root) return [];
    return [{ path: '.plugin/rules/_root.md', content: `---\nroot: true\n---\n${root.body}` }];
  },
  importFrom: async (projectRoot: string) => {
    const fromPath = join(projectRoot, '.plugin', 'rules', '_root.md');
    return [
      {
        fromTool: PLUGIN_ID,
        fromPath,
        toPath: '.agentsmesh/rules/_root.md',
        feature: 'rules',
      },
    ];
  },
};

const pluginDescriptor: TargetDescriptor = {
  id: PLUGIN_ID,
  metadata: {
    displayName: PLUGIN_ID,
    category: 'cli',
    officialUrl: 'https://example.test/plugin',
    shortDescription: 'Plugin descriptor contract test fixture',
  },
  generators: pluginGenerators,
  capabilities: {
    rules: { level: 'native' },
    additionalRules: { level: 'none' },
    commands: { level: 'none' },
    agents: { level: 'none' },
    skills: { level: 'none' },
    mcp: { level: 'none' },
    hooks: { level: 'none' },
    ignore: { level: 'none' },
    permissions: { level: 'none' },
  },
  emptyImportMessage: 'No plugin files.',
  lintRules: null,
  project,
  buildImportPaths: async () => {},
  detectionPaths: ['.plugin'],
};

describe('plugin descriptor contract', () => {
  let tmp = '';
  beforeEach(() => {
    resetRegistry();
    registerTargetDescriptor(pluginDescriptor);
    tmp = join(tmpdir(), `am-plugin-${randomBytes(8).toString('hex')}`);
    mkdirSync(tmp, { recursive: true });
  });
  afterEach(() => {
    resetRegistry();
    rmSync(tmp, { recursive: true, force: true });
  });

  it('generateRules then importFrom round-trips a minimal rule', async () => {
    const canonical: CanonicalFiles = {
      rules: [
        {
          source: '/x/.agentsmesh/rules/_root.md',
          root: true,
          targets: [],
          description: '',
          globs: [],
          body: '# Plugin contract\n',
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
    const gen = getDescriptor(PLUGIN_ID)!.generators;
    const results = gen.generateRules(canonical);
    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe('.plugin/rules/_root.md');

    mkdirSync(join(tmp, '.plugin', 'rules'), { recursive: true });
    writeFileSync(join(tmp, '.plugin', 'rules', '_root.md'), results[0]!.content);
    const imported = await gen.importFrom(tmp);
    expect(imported.map((i) => i.toPath)).toEqual(['.agentsmesh/rules/_root.md']);
  });
});
