/**
 * OpenCode target descriptor.
 *
 * Generation emits:
 *   - `AGENTS.md`                    — root rule
 *   - `.opencode/rules/<slug>.md`    — additional rules
 *   - `.opencode/commands/<name>.md` — slash commands
 *   - `.opencode/agents/<slug>.md`   — custom agents
 *   - `.opencode/skills/`            — skill bundles
 *   - `opencode.json`               — MCP servers under `mcp`, additional-rule
 *     globs under `instructions`, and canonical permissions + ignore path deny
 *     rules under `permission`
 *
 * Import reads both `AGENTS.md` and `.opencode/` directory structure.
 * OpenCode also reads `CLAUDE.md` as a fallback, but we import from
 * the canonical `AGENTS.md` path only.
 */

import { AB_AGENTS, AB_COMMANDS, AB_RULES } from '../../core/canonical-paths.js';
import type { TargetGenerators } from '../catalog/target.interface.js';
import type { TargetDescriptor } from '../catalog/target-descriptor.js';
import { generateRules, generateCommands, generateAgents, generateSkills } from './generator.js';
import {
  OPENCODE_TARGET,
  OPENCODE_ROOT_RULE,
  OPENCODE_RULES_DIR,
  OPENCODE_COMMANDS_DIR,
  OPENCODE_AGENTS_DIR,
  OPENCODE_SKILLS_DIR,
  OPENCODE_CONFIG_FILE,
  OPENCODE_GLOBAL_AGENTS_MD,
  OPENCODE_GLOBAL_RULES_DIR,
  OPENCODE_GLOBAL_COMMANDS_DIR,
  OPENCODE_GLOBAL_AGENTS_DIR,
  OPENCODE_GLOBAL_SKILLS_DIR,
  OPENCODE_GLOBAL_CONFIG_FILE,
} from './constants.js';
import { importFromOpenCode } from './importer.js';
import {
  opencodeAgentMapper,
  opencodeCommandMapper,
  opencodeNonRootRuleMapper,
} from './import-mappers.js';
import { lintRules } from './linter.js';
import { lintHooks, lintIgnore } from './lint.js';
import { buildOpencodeImportPaths } from '../../core/reference/import-map-builders.js';
import { emitOpenCodeScopedSettings, mergeOpenCodeSettings } from './scoped-settings.js';
import { capabilities, globalLayout, project } from './layout.js';

export const target: TargetGenerators = {
  name: OPENCODE_TARGET,
  primaryRootInstructionPath: OPENCODE_ROOT_RULE,
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  importFrom: importFromOpenCode,
};

export const descriptor = {
  id: OPENCODE_TARGET,
  metadata: {
    displayName: 'OpenCode',
    category: 'cli',
    officialUrl: 'https://opencode.ai',
    shortDescription: 'Open-source terminal AI agent',
  },
  generators: target,
  capabilities,
  emptyImportMessage:
    'No OpenCode config found (AGENTS.md, .opencode/rules, .opencode/commands, .opencode/agents, .opencode/skills, or opencode.json).',
  lintRules,
  lint: {
    hooks: lintHooks,
    ignore: lintIgnore,
  },
  project,
  globalSupport: {
    capabilities,
    detectionPaths: [
      OPENCODE_GLOBAL_AGENTS_MD,
      OPENCODE_GLOBAL_RULES_DIR,
      OPENCODE_GLOBAL_COMMANDS_DIR,
      OPENCODE_GLOBAL_AGENTS_DIR,
      OPENCODE_GLOBAL_SKILLS_DIR,
      OPENCODE_GLOBAL_CONFIG_FILE,
    ],
    layout: globalLayout,
  },
  mergeGeneratedOutputContent: mergeOpenCodeSettings,
  emitScopedSettings: emitOpenCodeScopedSettings,
  importer: {
    rules: [
      {
        feature: 'rules',
        mode: 'singleFile',
        source: {
          project: [OPENCODE_ROOT_RULE],
          global: [OPENCODE_GLOBAL_AGENTS_MD],
        },
        canonicalDir: AB_RULES,
        canonicalRootFilename: '_root.md',
        markAsRoot: true,
      },
      {
        feature: 'rules',
        mode: 'directory',
        source: {
          project: [OPENCODE_RULES_DIR],
          global: [OPENCODE_GLOBAL_RULES_DIR],
        },
        canonicalDir: AB_RULES,
        extensions: ['.md'],
        map: opencodeNonRootRuleMapper,
      },
    ],
    commands: {
      feature: 'commands',
      mode: 'directory',
      source: {
        project: [OPENCODE_COMMANDS_DIR],
        global: [OPENCODE_GLOBAL_COMMANDS_DIR],
      },
      canonicalDir: AB_COMMANDS,
      extensions: ['.md'],
      map: opencodeCommandMapper,
    },
    agents: {
      feature: 'agents',
      mode: 'directory',
      source: {
        project: [OPENCODE_AGENTS_DIR],
        global: [OPENCODE_GLOBAL_AGENTS_DIR],
      },
      canonicalDir: AB_AGENTS,
      extensions: ['.md'],
      map: opencodeAgentMapper,
    },
    // MCP is imported manually in importer.ts because OpenCode uses `mcp`
    // key (not `mcpServers`) with a different server format.
  },
  buildImportPaths: buildOpencodeImportPaths,
  detectionPaths: [
    OPENCODE_RULES_DIR,
    OPENCODE_COMMANDS_DIR,
    OPENCODE_AGENTS_DIR,
    OPENCODE_SKILLS_DIR,
    OPENCODE_CONFIG_FILE,
    'opencode.jsonc',
  ],
} satisfies TargetDescriptor;
