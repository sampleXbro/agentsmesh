/**
 * Comprehensive test plugin covering ALL TargetDescriptor features:
 * - All canonical features (rules, commands, agents, skills, mcp, hooks, permissions, ignore)
 * - generators.lint hook + generators.primaryRootInstructionPath
 * - Per-feature lint hooks (lint.commands, lint.mcp, lint.permissions, lint.hooks, lint.ignore)
 * - Project and global layouts with rootInstructionPath, skillDir, outputFamilies,
 *   renderPrimaryRootInstruction, rewriteGeneratedPath, mirrorGlobalPath
 * - Import path mapping (buildImportPaths)
 * - Capability levels (native, embedded, partial, none, object form)
 * - globalSupport
 * - supportsConversion (commands + agents)
 * - globalSupport.scopeExtras
 * - sharedArtifacts ownership declaration
 * - emitScopedSettings native settings sidecar
 * - mergeGeneratedOutputContent shared-config merge hook
 * - postProcessHookOutputs async hook post-processing
 * - hookContextEvents (events whose hook output reaches the model)
 * - Detection paths
 */

/* eslint-disable no-unused-vars */

import { basename } from 'node:path';

export const descriptor = {
  id: 'rich-plugin',

  // ──── User-facing metadata (H6 — required by schema) ──
  metadata: {
    displayName: 'Rich Plugin',
    category: 'ide',
    officialUrl: 'https://example.test/rich-plugin',
    shortDescription: 'Test plugin covering every TargetDescriptor surface',
  },

  // ──── Generators (all 8 feature generators + lint + primaryRootInstructionPath) ──
  generators: {
    name: 'rich-plugin',
    primaryRootInstructionPath: '.rich/ROOT.md',

    generateRules(canonical) {
      const results = [];
      const rootRule = canonical.rules.find((r) => r.root);
      if (rootRule) {
        results.push({
          path: '.rich/ROOT.md',
          content: `# Rich Plugin Root\n\n${rootRule.body}`,
        });
      }
      for (const rule of canonical.rules.filter((r) => !r.root)) {
        // Use platform-aware basename: `rule.source` uses native separators on
        // Windows, so `split('/')` would return the entire absolute path.
        const slug = basename(rule.source, '.md');
        results.push({
          path: `.rich/rules/${slug}.md`,
          content: `# ${rule.description}\n\n${rule.body}`,
        });
      }
      return results;
    },

    generateCommands(canonical) {
      return canonical.commands.map((cmd) => ({
        path: `.rich/commands/${cmd.name}.md`,
        content: `# Command: ${cmd.name}\n\n${cmd.description}\n\n${cmd.body}`,
      }));
    },

    generateAgents(canonical) {
      return canonical.agents.map((agent) => ({
        path: `.rich/agents/${agent.name}.md`,
        content: `# Agent: ${agent.name}\n\n${agent.body}`,
      }));
    },

    generateSkills(canonical) {
      return canonical.skills.map((skill) => ({
        path: `.rich/skills/${skill.name}/SKILL.md`,
        content: `# Skill: ${skill.name}\n\n${skill.body}`,
      }));
    },

    generateMcp(canonical) {
      if (!canonical.mcp) return [];
      return [
        {
          path: `.rich/mcp.json`,
          content: JSON.stringify(canonical.mcp, null, 2),
        },
      ];
    },

    generatePermissions(canonical) {
      if (!canonical.permissions) return [];
      return [
        {
          path: `.rich/permissions.json`,
          content: JSON.stringify(canonical.permissions, null, 2),
        },
      ];
    },

    generateHooks(canonical) {
      if (!canonical.hooks) return [];
      return [
        {
          path: `.rich/hooks.json`,
          content: JSON.stringify(canonical.hooks, null, 2),
        },
      ];
    },

    generateIgnore(canonical) {
      if (canonical.ignore.length === 0) return [];
      return [
        {
          path: `.richignore`,
          content: canonical.ignore.join('\n'),
        },
      ];
    },

    lint(canonical) {
      const issues = [];
      for (const rule of canonical.rules) {
        if (!rule.root && (!rule.description || rule.description.trim().length === 0)) {
          issues.push({
            level: 'error',
            file: rule.source,
            target: 'rich-plugin',
            message: 'Non-root rule must have a description',
          });
        }
      }
      return issues;
    },

    async importFrom(_projectRoot, _options) {
      return [];
    },
  },

  // ──── Capabilities (all 9 features with mixed levels) ────────────────────
  capabilities: {
    rules: 'native',
    additionalRules: 'partial',
    commands: 'embedded',
    agents: { level: 'embedded', flavor: 'markdown' },
    skills: 'partial',
    mcp: 'native',
    hooks: 'embedded',
    ignore: 'native',
    permissions: 'partial',
  },

  // ──── Per-feature Lint Hooks ───────────────────────────────────────────────
  lint: {
    commands(canonical) {
      const issues = [];
      for (const cmd of canonical.commands) {
        if (!cmd.description || cmd.description.trim().length === 0) {
          issues.push({
            level: 'warning',
            file: cmd.source || '',
            target: 'rich-plugin',
            message: `Command '${cmd.name}' is missing a description`,
          });
        }
      }
      return issues;
    },
    mcp(canonical) {
      const issues = [];
      if (canonical.mcp && canonical.mcp.mcpServers) {
        for (const [name, server] of Object.entries(canonical.mcp.mcpServers)) {
          if (!server.command && !server.url) {
            issues.push({
              level: 'error',
              file: '',
              target: 'rich-plugin',
              message: `MCP server '${name}' has no command or url`,
            });
          }
        }
      }
      return issues;
    },
    permissions(canonical) {
      const issues = [];
      if (canonical.permissions && canonical.permissions.deny) {
        for (const denied of canonical.permissions.deny) {
          if (canonical.permissions.allow && canonical.permissions.allow.includes(denied)) {
            issues.push({
              level: 'error',
              file: '',
              target: 'rich-plugin',
              message: `Permission '${denied}' is both allowed and denied`,
            });
          }
        }
      }
      return issues;
    },
    hooks(canonical) {
      const issues = [];
      if (canonical.hooks) {
        for (const [event, hookList] of Object.entries(canonical.hooks)) {
          if (Array.isArray(hookList)) {
            for (const hook of hookList) {
              if (!hook.command || hook.command.trim().length === 0) {
                issues.push({
                  level: 'warning',
                  file: '',
                  target: 'rich-plugin',
                  message: `Hook in '${event}' has an empty command`,
                });
              }
            }
          }
        }
      }
      return issues;
    },
    ignore(canonical) {
      const issues = [];
      const seen = new Set();
      for (const pattern of canonical.ignore) {
        if (seen.has(pattern)) {
          issues.push({
            level: 'warning',
            file: '',
            target: 'rich-plugin',
            message: `Duplicate ignore pattern: '${pattern}'`,
          });
        }
        seen.add(pattern);
      }
      return issues;
    },
  },

  // ──── Supports Conversion (commands + agents) ──────────────────────────────
  supportsConversion: { commands: true, agents: true },

  // ──── Project Layout ──────────────────────────────────────────────────────
  project: {
    rootInstructionPath: '.rich/ROOT.md',
    skillDir: '.rich/skills',
    // `.rich/mcp.json` is the co-owned file: `mergeGeneratedOutputContent`
    // claims it, so it must NOT be in `files` (the stale-cleanup delete list)
    // or disabling the `mcp` feature would delete the user's whole config.
    managedOutputs: {
      dirs: ['.rich/rules', '.rich/commands', '.rich/agents', '.rich/skills'],
      files: [
        '.richignore',
        '.rich/ROOT.md',
        '.rich/hooks.json',
        '.rich/permissions.json',
        '.rich/settings.json',
      ],
      coOwnedFiles: ['.rich/mcp.json'],
      supersededFiles: ['.rich/LEGACY-ROOT.md'],
    },
    outputFamilies: [
      { id: 'rules', kind: 'primary', pathPrefix: '.rich/rules/' },
      { id: 'commands', kind: 'additional', pathPrefix: '.rich/commands/' },
      { id: 'agents', kind: 'additional', pathPrefix: '.rich/agents/' },
    ],
    paths: {
      rulePath(slug, _rule) {
        return `.rich/rules/${slug}.md`;
      },
      commandPath(name, _config) {
        return `.rich/commands/${name}.md`;
      },
      agentPath(name, _config) {
        return `.rich/agents/${name}.md`;
      },
    },
    mirrorGlobalPath(_path, _targets) {
      return null;
    },
  },

  // ──── Shared Artifacts ─────────────────────────────────────────────────────
  sharedArtifacts: {
    '.rich/skills/': 'owner',
  },

  // ──── Global Support ──────────────────────────────────────────────────────
  globalSupport: {
    capabilities: {
      rules: 'native',
      additionalRules: 'none',
      commands: 'embedded',
      agents: 'embedded',
      skills: 'none',
      mcp: 'native',
      hooks: 'native',
      ignore: 'native',
      permissions: 'native',
    },
    detectionPaths: ['.rich', '.rich/ROOT.md', '.richignore'],
    layout: {
      rootInstructionPath: '.rich/ROOT.md',
      skillDir: '.rich/skills',
      managedOutputs: {
        dirs: ['.rich/rules', '.rich/commands', '.rich/agents'],
        files: [
          '.richignore',
          '.rich/ROOT.md',
          '.rich/hooks.json',
          '.rich/permissions.json',
          '.rich/settings.json',
        ],
        coOwnedFiles: ['.rich/mcp.json'],
      },
      outputFamilies: [
        { id: 'rules', kind: 'primary', pathPrefix: '.rich/rules/' },
        { id: 'agents', kind: 'additional', pathPrefix: '.rich/agents/' },
      ],
      renderPrimaryRootInstruction(canonical) {
        const rootRule = canonical.rules.find((r) => r.root);
        if (!rootRule) return '';
        return `# Rich Plugin Global\n\n${rootRule.body}\n\n<!-- managed by agentsmesh -->`;
      },
      paths: {
        rulePath(slug, _rule) {
          return `.rich/rules/${slug}.md`;
        },
        commandPath(name, _config) {
          return `.rich/commands/${name}.md`;
        },
        agentPath(name, _config) {
          return `.rich/agents/${name}.md`;
        },
      },
      rewriteGeneratedPath(path) {
        return path;
      },
    },
    async scopeExtras(canonical, _projectRoot, scope, enabledFeatures) {
      const results = [];
      if (scope === 'global' && enabledFeatures.has('rules')) {
        results.push({
          path: '.rich/scope-info.txt',
          content: `scope=${scope}\nfeatures=${[...enabledFeatures].join(',')}`,
        });
      }
      // A canonical-only projection into the CO-OWNED file. scopeExtras used to
      // bypass the shared merge policy, so an emit like this replaced the user's
      // whole config; the engine must run it through
      // `mergeGeneratedOutputContent` and dedup it against the pending `mcp`
      // result for the same path, exactly as it does for a builtin.
      if (scope === 'global' && enabledFeatures.has('mcp') && canonical.mcp) {
        results.push({
          path: '.rich/mcp.json',
          content: JSON.stringify({ mcpServers: canonical.mcp.mcpServers }, null, 2),
        });
      }
      return results;
    },
  },

  // ──── Shared-config Merge Hook ────────────────────────────────────────────
  // `.rich/mcp.json` stands in for a config file the USER also owns: the plugin
  // owns only the `mcpServers` key. Proves the shared merge policy reaches a
  // registered plugin descriptor on the generateFeature path (rules, commands,
  // agents, skills, mcp, ignore), not just on permissions/hooks/scoped settings.
  mergeGeneratedOutputContent(existing, pending, newContent, resolvedPath) {
    if (resolvedPath !== '.rich/mcp.json') return null;
    const base = pending?.content ?? existing;
    if (base === null || base === undefined) return null;
    try {
      const merged = JSON.parse(base);
      merged.mcpServers = JSON.parse(newContent).mcpServers;
      return JSON.stringify(merged, null, 2);
    } catch {
      return null;
    }
  },

  // ──── Revocation Claims ───────────────────────────────────────────────────
  // Declares the cleared projection for the co-owned `.rich/mcp.json`. Proves
  // `emitRevocations` reaches a registered plugin descriptor: an emptied
  // `.agentsmesh/mcp.json` must clear `mcpServers` here too, and the plugin's
  // own merge hook is what performs the clear.

  // ──── Scoped Settings Sidecar ──────────────────────────────────────────────
  // Receives the enabled-feature set so a plugin can gate each key, exactly like
  // the builtin emitters — proves the engine threads `enabledFeatures` to plugin
  // descriptors too (not just builtins).
  emitScopedSettings(canonical, scope, enabledFeatures) {
    const settings = {
      version: 1,
      scope,
      featureCount: canonical.rules.length + canonical.commands.length + canonical.agents.length,
      // Gated: only present when the mcp feature is enabled for this generate.
      ...(enabledFeatures?.has('mcp') && canonical.mcp
        ? { mcpServers: canonical.mcp.mcpServers }
        : {}),
    };
    return [{ path: '.rich/settings.json', content: JSON.stringify(settings, null, 2) }];
  },

  // ──── Post-process Hook Outputs ────────────────────────────────────────────
  async postProcessHookOutputs(_projectRoot, canonical, outputs) {
    const processed = [...outputs];
    for (const output of outputs) {
      if (output.path.endsWith('.json') && output.path.includes('hooks')) {
        processed.push({
          path: output.path.replace('.json', '.wrapper.sh'),
          content: '#!/bin/sh\n# auto-generated hook wrapper\nexec "$@"\n',
        });
      }
    }
    return processed;
  },

  // ──── Hook Context Events ──────────────────────────────────────────────────
  // Only SessionStart output reaches the model, so the lessons recall hook is
  // kept there and dropped from every other event.
  hookContextEvents: ['SessionStart'],

  // ──── Import Path Mapping ──────────────────────────────────────────────────
  async buildImportPaths(refs, _projectRoot, _scope) {
    refs.set('.rich/custom-rule.md', 'CUSTOM.md');
    refs.set('.rich/ROOT.md', '.agentsmesh/rules/_root.md');
  },

  // ──── Detection Paths ──────────────────────────────────────────────────────
  detectionPaths: ['.rich', '.rich/ROOT.md', '.rich/commands', '.rich/agents', '.richignore'],

  // ──── Lint Rules Callback ──────────────────────────────────────────────────
  lintRules(canonical, _projectRoot, _projectFiles, _options) {
    const issues = [];
    for (const rule of canonical.rules) {
      if (!rule.body || rule.body.trim().length === 0) {
        issues.push({
          level: 'warning',
          file: rule.source,
          target: 'rich-plugin',
          message: 'Rule has empty body',
        });
      }
    }
    return issues;
  },

  // ──── Empty Import Message ─────────────────────────────────────────────────
  emptyImportMessage: 'No Rich plugin config found (.rich/ directory).',
};
