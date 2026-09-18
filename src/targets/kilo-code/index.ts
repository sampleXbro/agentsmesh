/**
 * Kilo Code target descriptor.
 *
 * Project scope uses the new layout (`AGENTS.md` + `.kilo/...` + `kilo.jsonc`
 * for permissions). Global scope is a DIFFERENT, unified shape — root rule,
 * commands, and agents stay plain files under `~/.config/kilo/`, skills stay
 * under `~/.kilo/skills/`, but additional rules and MCP servers fold into
 * `~/.config/kilo/kilo.jsonc` as `instructions`/`mcp` keys (no global ignore
 * mechanism exists). See constants.ts and global-settings.ts for the full
 * rationale and doc citations.
 *
 * Import covers BOTH new and legacy layouts so existing kilo / Roo-era users
 * round-trip cleanly.
 */

import { AB_AGENTS, AB_COMMANDS, AB_IGNORE, AB_MCP, AB_RULES } from '../../core/canonical-paths.js';
import type { TargetGenerators } from '../catalog/target.interface.js';
import type { TargetDescriptor } from '../catalog/target-descriptor.js';
import {
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateMcp,
  generateIgnore,
  generatePermissions,
} from './generator.js';
import {
  KILO_CODE_TARGET,
  KILO_CODE_ROOT_RULE,
  KILO_CODE_LEGACY_RULES_DIR,
  KILO_CODE_LEGACY_WORKFLOWS_DIR,
  KILO_CODE_LEGACY_SKILLS_DIR,
  KILO_CODE_LEGACY_MCP_FILE,
  KILO_CODE_LEGACY_MODES_FILE,
  KILO_CODE_GLOBAL_AGENTS_MD,
  KILO_CODE_GLOBAL_RULES_DIR,
  KILO_CODE_GLOBAL_COMMANDS_DIR,
  KILO_CODE_GLOBAL_AGENTS_DIR,
  KILO_CODE_GLOBAL_SKILLS_DIR,
  KILO_CODE_RULES_DIR,
  KILO_CODE_COMMANDS_DIR,
  KILO_CODE_AGENTS_DIR,
  KILO_CODE_SKILLS_DIR,
  KILO_CODE_MCP_FILE,
  KILO_CODE_IGNORE,
  KILO_GLOBAL_CONFIG_FILE,
} from './constants.js';
import { importFromKiloCode } from './importer.js';
import { kiloAgentMapper, kiloCommandMapper, kiloNonRootRuleMapper } from './import-mappers.js';
import { lintRules } from './linter.js';
import { lintHooks } from './lint.js';
import { buildKiloCodeImportPaths } from '../../core/reference/import-map-builders.js';
import { mergeKiloConfig, mergeKiloMcpJson } from './merge.js';
import { emitKiloGlobalSettings } from './global-settings.js';
import { project, globalLayout, capabilities, globalCapabilities } from './layout.js';

export const target: TargetGenerators = {
  name: KILO_CODE_TARGET,
  primaryRootInstructionPath: KILO_CODE_ROOT_RULE,
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateMcp,
  generateIgnore,
  generatePermissions,
  importFrom: importFromKiloCode,
};

export const descriptor = {
  id: KILO_CODE_TARGET,
  metadata: {
    displayName: 'Kilo Code',
    category: 'ide',
    officialUrl: 'https://kilocode.ai',
    shortDescription: 'Open-source AI coding agent for VS Code',
  },
  generators: target,
  capabilities,
  emptyImportMessage:
    'No Kilo Code config found (AGENTS.md, .kilo/rules, .kilo/commands, .kilo/agents, .kilo/skills, .kilo/mcp.json, .kilocodeignore, .kilocode/, or .kilocodemodes).',
  lintRules,
  lint: {
    hooks: lintHooks,
  },
  mergeGeneratedOutputContent: (existing, pending, newContent, resolvedPath) =>
    mergeKiloConfig(existing, pending, newContent, resolvedPath) ??
    mergeKiloMcpJson(existing, pending, newContent, resolvedPath),
  emitScopedSettings: emitKiloGlobalSettings,
  project,
  globalSupport: {
    capabilities: globalCapabilities,
    detectionPaths: [
      KILO_CODE_GLOBAL_AGENTS_MD,
      KILO_CODE_GLOBAL_RULES_DIR,
      KILO_CODE_GLOBAL_COMMANDS_DIR,
      KILO_CODE_GLOBAL_AGENTS_DIR,
      KILO_CODE_GLOBAL_SKILLS_DIR,
      KILO_GLOBAL_CONFIG_FILE,
    ],
    layout: globalLayout,
  },
  importer: {
    rules: [
      {
        // Root rule: prefer AGENTS.md (new) → in legacy projects users
        // historically used .kilocode/rules/00-root.md, but those import
        // through the descriptor's directory mapper as a regular rule with
        // slug `00-root` (we don't promote them to root). The legacy global
        // rules dir falls back to AGENTS.md only.
        feature: 'rules',
        mode: 'singleFile',
        source: {
          project: [KILO_CODE_ROOT_RULE],
          global: [KILO_CODE_GLOBAL_AGENTS_MD],
        },
        canonicalDir: AB_RULES,
        canonicalRootFilename: '_root.md',
        markAsRoot: true,
      },
      {
        feature: 'rules',
        mode: 'directory',
        source: {
          project: [KILO_CODE_RULES_DIR],
          global: [KILO_CODE_GLOBAL_RULES_DIR],
        },
        canonicalDir: AB_RULES,
        extensions: ['.md'],
        map: kiloNonRootRuleMapper,
      },
    ],
    commands: {
      feature: 'commands',
      mode: 'directory',
      source: {
        project: [KILO_CODE_COMMANDS_DIR],
        global: [KILO_CODE_GLOBAL_COMMANDS_DIR],
      },
      canonicalDir: AB_COMMANDS,
      extensions: ['.md'],
      map: kiloCommandMapper,
    },
    agents: {
      feature: 'agents',
      mode: 'directory',
      source: {
        project: [KILO_CODE_AGENTS_DIR],
        global: [KILO_CODE_GLOBAL_AGENTS_DIR],
      },
      canonicalDir: AB_AGENTS,
      extensions: ['.md'],
      map: kiloAgentMapper,
    },
    mcp: {
      feature: 'mcp',
      mode: 'mcpJson',
      // Global scope has no `source.global`: at global scope MCP servers are
      // a key inside the shared kilo.jsonc (different schema entirely — see
      // `mcp` key in kilo.ai/docs/automate/mcp/using-in-kilo-code), imported
      // manually by importGlobalMcp() in importer.ts instead of this generic
      // mcpJson-file mode.
      source: {
        project: [KILO_CODE_MCP_FILE, KILO_CODE_LEGACY_MCP_FILE],
      },
      canonicalDir: '.agentsmesh',
      canonicalFilename: AB_MCP,
    },
    ignore: {
      feature: 'ignore',
      mode: 'flatFile',
      // Project-only: no documented global `.kilocodeignore` equivalent
      // (kilo.ai/docs/customize/context/kilocodeignore is workspace-root-only).
      source: {
        project: [KILO_CODE_IGNORE],
      },
      canonicalDir: '.agentsmesh',
      canonicalFilename: AB_IGNORE,
    },
  },
  buildImportPaths: buildKiloCodeImportPaths,
  detectionPaths: [
    KILO_CODE_RULES_DIR,
    KILO_CODE_COMMANDS_DIR,
    KILO_CODE_AGENTS_DIR,
    KILO_CODE_SKILLS_DIR,
    KILO_CODE_MCP_FILE,
    KILO_CODE_LEGACY_RULES_DIR,
    KILO_CODE_LEGACY_WORKFLOWS_DIR,
    KILO_CODE_LEGACY_SKILLS_DIR,
    KILO_CODE_LEGACY_MCP_FILE,
    KILO_CODE_LEGACY_MODES_FILE,
    KILO_CODE_IGNORE,
    'kilo.jsonc',
    'kilo.json',
  ],
} satisfies TargetDescriptor;
