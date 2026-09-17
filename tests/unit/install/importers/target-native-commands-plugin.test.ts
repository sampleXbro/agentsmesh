/**
 * Plugin-registered target descriptors with non-`.md` command mappers must
 * be enumerated by `readEntityDirWithMappers` exactly like builtins.
 *
 * Regression for the install-paths-delegate-target-mappers refactor: the
 * initial implementation iterated `TARGET_IDS` (builtin-only), so a
 * plugin descriptor registered via `registerTargetDescriptor` was
 * invisible — the user's whole plugin-extension story for new command
 * formats would silently fall back to `.md`-only.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  registerTargetDescriptor,
  resetRegistry,
} from '../../../../src/targets/catalog/registry.js';
import { readEntityDirWithMappers } from '../../../../src/install/importers/target-native-commands.js';
import type {
  TargetDescriptor,
  TargetLayout,
} from '../../../../src/targets/catalog/target-descriptor.js';
import type { TargetGenerators } from '../../../../src/targets/catalog/target.interface.js';

const PLUGIN_ID = 'plugin-yaml-tool';
const ROOT = join(tmpdir(), 'am-target-native-commands-plugin');

const project: TargetLayout = {
  rootInstructionPath: `.${PLUGIN_ID}/rules/_root.md`,
  skillDir: `.${PLUGIN_ID}/skills`,
  rewriteGeneratedPath: (p) => p,
  paths: {
    rulePath: () => null,
    commandPath: () => null,
    agentPath: () => null,
  },
};

const pluginGenerators: TargetGenerators = {
  name: PLUGIN_ID,
  generateRules: () => [],
  generateCommands: () => [],
  generateAgents: () => [],
  importFrom: async () => [],
};

/**
 * Plugin descriptor that ships non-`.md` mappers for ALL three
 * directory-walked entity kinds. Proves the seam is symmetric — adding a
 * runtime plugin with custom rules/commands/agents formats lights them all
 * up on the install path without core changes.
 */
function makePluginDescriptor(): TargetDescriptor {
  const yamlMapper = (
    label: 'rule' | 'command' | 'agent',
  ): NonNullable<NonNullable<TargetDescriptor['importer']>['commands']>['map'] => {
    return ({ relativePath, content, destDir }) => {
      const name = relativePath.replace(/\.yaml$/i, '').replaceAll('/', '-');
      const description =
        (content.match(/^description:\s*(.+)$/m)?.[1] ?? '').trim() || `plugin ${label}`;
      return {
        destPath: join(destDir, `${name}.md`),
        content: `---\ndescription: ${description}\n---\n# ${name}\n\nFrom yaml plugin.\n`,
      };
    };
  };
  return {
    id: PLUGIN_ID,
    metadata: {
      displayName: PLUGIN_ID,
      category: 'cli',
      officialUrl: 'https://example.test/plugin',
      shortDescription: 'Plugin descriptor with .yaml mappers for rules/commands/agents',
    },
    generators: pluginGenerators,
    capabilities: {
      rules: { level: 'native' },
      additionalRules: { level: 'none' },
      commands: { level: 'native' },
      agents: { level: 'native' },
      skills: { level: 'none' },
      mcp: { level: 'none' },
      hooks: { level: 'none' },
      ignore: { level: 'none' },
      permissions: { level: 'none' },
    },
    emptyImportMessage: 'No plugin files.',
    lintRules: null,
    project,
    importer: {
      rules: {
        feature: 'rules',
        mode: 'directory',
        source: { project: [`.${PLUGIN_ID}/rules`] },
        canonicalDir: '.agentsmesh/rules',
        extensions: ['.yaml'],
        map: yamlMapper('rule'),
      },
      commands: {
        feature: 'commands',
        mode: 'directory',
        source: { project: [`.${PLUGIN_ID}/commands`] },
        canonicalDir: '.agentsmesh/commands',
        extensions: ['.yaml'],
        map: yamlMapper('command'),
      },
      agents: {
        feature: 'agents',
        mode: 'directory',
        source: { project: [`.${PLUGIN_ID}/agents`] },
        canonicalDir: '.agentsmesh/agents',
        extensions: ['.yaml'],
        map: yamlMapper('agent'),
      },
    },
    buildImportPaths: async () => {},
    detectionPaths: [`.${PLUGIN_ID}`],
  };
}

beforeEach(() => {
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(ROOT, { recursive: true });
  resetRegistry();
});

afterEach(() => {
  rmSync(ROOT, { recursive: true, force: true });
  resetRegistry();
});

describe('plugin descriptor enumeration in readEntityDirWithMappers', () => {
  it('commands: picks up files from a plugin target with .yaml extension', async () => {
    registerTargetDescriptor(makePluginDescriptor());

    const dir = join(ROOT, 'commands');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'plugin-cmd.yaml'), 'description: Hello from plugin\n');

    const { entities: commands, cleanup } = await readEntityDirWithMappers(dir, 'commands');
    try {
      expect(commands).toHaveLength(1);
      expect(commands[0]!.name).toBe('plugin-cmd');
      expect(commands[0]!.description).toBe('Hello from plugin');
    } finally {
      await cleanup();
    }
  });

  it('rules: picks up files from a plugin target with .yaml extension', async () => {
    registerTargetDescriptor(makePluginDescriptor());

    const dir = join(ROOT, 'rules');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'plugin-rule.yaml'), 'description: A plugin rule\n');

    const { entities: rules, cleanup } = await readEntityDirWithMappers(dir, 'rules');
    try {
      expect(rules).toHaveLength(1);
      expect(rules[0]!.source.endsWith('plugin-rule.md')).toBe(true);
      expect(rules[0]!.description).toBe('A plugin rule');
    } finally {
      await cleanup();
    }
  });

  it('agents: picks up files from a plugin target with .yaml extension', async () => {
    registerTargetDescriptor(makePluginDescriptor());

    const dir = join(ROOT, 'agents');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'plugin-agent.yaml'), 'description: A plugin agent\n');

    const { entities: agents, cleanup } = await readEntityDirWithMappers(dir, 'agents');
    try {
      expect(agents).toHaveLength(1);
      expect(agents[0]!.name).toBe('plugin-agent');
      expect(agents[0]!.description).toBe('A plugin agent');
    } finally {
      await cleanup();
    }
  });

  it('canonical .md wins over a plugin mapper when both claim the same slug', async () => {
    // The seam dedups by source-file slug (basename without extension).
    // When the canonical reader and a plugin mapper both produce an entity
    // with the same slug, the canonical entry wins because its `.source`
    // points at the upstream file (preserving dedup metadata + error paths).
    // This locks the precedence rule that lives at the dedup loop.
    registerTargetDescriptor(makePluginDescriptor());

    const dir = join(ROOT, 'commands');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'shared.md'), '---\ndescription: From canonical .md\n---\n# shared\n');
    writeFileSync(join(dir, 'shared.yaml'), 'description: From yaml plugin\n');

    const { entities: commands, cleanup } = await readEntityDirWithMappers(dir, 'commands');
    try {
      expect(commands).toHaveLength(1);
      expect(commands[0]!.name).toBe('shared');
      // Canonical reader wins: description comes from the .md, source path
      // points at the upstream .md (not the staged tmpdir copy).
      expect(commands[0]!.description).toBe('From canonical .md');
      // Forward-slash assertion: production source paths use native
      // separators (back-slash on Windows), so normalize before comparing.
      expect(commands[0]!.source.replaceAll('\\', '/').endsWith('/shared.md')).toBe(true);
      expect(commands[0]!.source).not.toContain('am-tool-');
    } finally {
      await cleanup();
    }
  });

  it('mapper returning null leaves the file out (no entity emitted)', async () => {
    // Exercises the `if (!mapping) continue` branch: a plugin mapper that
    // claims an extension can still skip individual files by returning
    // null (e.g. content fails the mapper's own schema check). The seam
    // must NOT emit a phantom entity in that case.
    const nullMapperDescriptor: TargetDescriptor = {
      ...makePluginDescriptor(),
      importer: {
        commands: {
          feature: 'commands',
          mode: 'directory',
          source: { project: [`.${PLUGIN_ID}/commands`] },
          canonicalDir: '.agentsmesh/commands',
          extensions: ['.yaml'],
          map: () => null,
        },
      },
    };
    registerTargetDescriptor(nullMapperDescriptor);

    const dir = join(ROOT, 'commands');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'rejected.yaml'), 'description: mapper returns null\n');

    const { entities: commands, cleanup } = await readEntityDirWithMappers(dir, 'commands');
    try {
      expect(commands).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it('restrictToTarget=<id without mapper> short-circuits to canonical-only', async () => {
    // The `restrict ? hasNonMdEntityMapper(...) ? [restrict] : []` branch:
    // when the named target has no non-`.md` mapper for this kind, the
    // seam falls back to the canonical reader alone — no staging, no
    // cleanup work. Without registering any plugin descriptor we hand
    // it a builtin (`claude-code`) whose commands importer is `.md`-only.
    const dir = join(ROOT, 'commands');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'plain.md'),
      '---\ndescription: plain canonical command\n---\n# plain\n',
    );

    const { entities: commands, cleanup } = await readEntityDirWithMappers(dir, 'commands', {
      restrictToTarget: 'claude-code',
    });
    try {
      expect(commands).toHaveLength(1);
      expect(commands[0]!.name).toBe('plain');
    } finally {
      await cleanup();
    }
  });

  it('cleans up the staging tmpdir when a plugin mapper throws', async () => {
    // Covers the catch-and-rethrow branch in `readToolNativeEntities`. A
    // throwing mapper must NOT leak its staging directory: cleanup runs
    // before the exception propagates so the OS tmpdir reaper has less
    // work to do (and tests / CI don't accumulate orphan dirs).
    const throwingDescriptor: TargetDescriptor = {
      ...makePluginDescriptor(),
      importer: {
        commands: {
          feature: 'commands',
          mode: 'directory',
          source: { project: [`.${PLUGIN_ID}/commands`] },
          canonicalDir: '.agentsmesh/commands',
          extensions: ['.yaml'],
          map: () => {
            throw new Error('boom');
          },
        },
      },
    };
    registerTargetDescriptor(throwingDescriptor);

    const dir = join(ROOT, 'commands');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'kaboom.yaml'), 'description: triggers throw\n');

    await expect(readEntityDirWithMappers(dir, 'commands')).rejects.toThrow('boom');
  });

  it('multi-spec rules importer: file only claimed by one spec skips the other (claimsExt continue branch)', async () => {
    // Rules' importer can be `ImportFeatureSpec | ImportFeatureSpec[]` —
    // Copilot uses the array form for builtin rule variants. When a file
    // matches the extensions of one spec but not another, the inner loop
    // must skip the non-claiming spec without calling its mapper. Locks
    // the dispatch precedence: "first matching spec wins".
    const multiSpecDescriptor: TargetDescriptor = {
      ...makePluginDescriptor(),
      importer: {
        rules: [
          {
            feature: 'rules',
            mode: 'directory',
            source: { project: [`.${PLUGIN_ID}/rules`] },
            canonicalDir: '.agentsmesh/rules',
            extensions: ['.foo'],
            map: ({ relativePath, destDir }) => {
              const name = relativePath.replace(/\.foo$/i, '');
              return {
                destPath: join(destDir, `${name}.md`),
                content: `---\ndescription: from foo mapper\n---\n# ${name}\n`,
              };
            },
          },
          {
            feature: 'rules',
            mode: 'directory',
            source: { project: [`.${PLUGIN_ID}/rules`] },
            canonicalDir: '.agentsmesh/rules',
            extensions: ['.bar'],
            map: ({ relativePath, destDir }) => {
              const name = relativePath.replace(/\.bar$/i, '');
              return {
                destPath: join(destDir, `${name}.md`),
                content: `---\ndescription: from bar mapper\n---\n# ${name}\n`,
              };
            },
          },
        ],
      },
    };
    registerTargetDescriptor(multiSpecDescriptor);

    const dir = join(ROOT, 'rules');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'only-foo.foo'), '');
    writeFileSync(join(dir, 'only-bar.bar'), '');

    const { entities: rules, cleanup } = await readEntityDirWithMappers(dir, 'rules');
    try {
      expect(rules).toHaveLength(2);
      const sources = rules.map((r) => r.source).sort();
      expect(sources[0]!.endsWith('only-bar.md')).toBe(true);
      expect(sources[1]!.endsWith('only-foo.md')).toBe(true);
      // Each file went through the spec that claimed its extension only.
      expect(rules.find((r) => r.source.endsWith('only-foo.md'))!.description).toBe(
        'from foo mapper',
      );
      expect(rules.find((r) => r.source.endsWith('only-bar.md'))!.description).toBe(
        'from bar mapper',
      );
    } finally {
      await cleanup();
    }
  });

  it('compound .md extensions (e.g. .agent.md) stay on the canonical reader — no double-counting', async () => {
    // Copilot's `agents` importer declares `extensions: ['.agent.md']`.
    // These files ARE Markdown — the canonical reader already picks them
    // up via `f.endsWith('.md')`. If the seam treated them as "non-`.md`"
    // and additionally routed them through the target mapper, we'd emit
    // two canonical agents per source file (one slugged `foo.agent`, one
    // slugged `foo`). Regression test for the 144 → 146 jump observed on
    // `VoltAgent/awesome-claude-code-subagents` during compatibility sweep.
    const dir = join(ROOT, 'agents');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'planner.agent.md'),
      '---\nname: planner.agent\ndescription: A planner agent\n---\n# planner\n',
    );

    // Copilot is a builtin; no plugin registration needed.
    const { entities: agents, cleanup } = await readEntityDirWithMappers(dir, 'agents');
    try {
      // Canonical reader sees ONE file → ONE agent.
      expect(agents).toHaveLength(1);
    } finally {
      await cleanup();
    }
  });
});
