/**
 * Crush target descriptor.
 *
 * Crush is a terminal TUI AI coding agent by Charmbracelet.
 * https://github.com/charmbracelet/crush
 *
 * Generate and import both cover `CRUSH.md` (root rule + embedded non-root
 * rules), `.crush/skills/`, `crush.json` (MCP, hooks, permissions) and
 * `.crushignore`. Global scope moves all four under `~/.config/crush/`, where
 * the ignore file is named `ignore` — extensionless, with no leading dot.
 *
 * Commands and agents are projected as skills via supportsConversion —
 * Crush has no native slash-command or Markdown-file agent format.
 */

import { AB_IGNORE, AB_RULES } from '../../core/canonical-paths.js';
import type { TargetCapabilities, TargetGenerators } from '../catalog/target.interface.js';
import type { TargetDescriptor, TargetLayout } from '../catalog/target-descriptor.js';
import { commandSkillDirName } from '../codex-cli/command-skill.js';
import { projectedAgentSkillDirName } from '../projection/projected-agent-skill.js';
import {
  generateRules,
  generateSkills,
  generateMcp,
  generateHooks,
  generatePermissions,
  generateIgnore,
  generateCommands,
  generateAgents,
} from './generator.js';
import { mirrorSkillsToAgents } from '../catalog/skill-mirror.js';
import { importFromCrush } from './importer.js';
import { lintRules } from './linter.js';
import { lintCommands } from './lint.js';
import { buildCrushImportPaths } from '../../core/reference/import-map-builders.js';
import { mergeCrushConfigJson } from '../../core/generate/settings.js';
import {
  CRUSH_TARGET,
  CRUSH_ROOT_FILE,
  CRUSH_SKILLS_DIR,
  CRUSH_CONFIG_FILE,
  CRUSH_IGNORE,
  CRUSH_GLOBAL_ROOT_FILE,
  CRUSH_GLOBAL_SKILLS_DIR,
  CRUSH_GLOBAL_CONFIG_FILE,
  CRUSH_GLOBAL_IGNORE,
} from './constants.js';

export const target: TargetGenerators = {
  name: CRUSH_TARGET,
  primaryRootInstructionPath: CRUSH_ROOT_FILE,
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateMcp,
  generateHooks,
  generatePermissions,
  generateIgnore,
  importFrom: importFromCrush,
};

const project: TargetLayout = {
  rootInstructionPath: CRUSH_ROOT_FILE,
  skillDir: CRUSH_SKILLS_DIR,
  managedOutputs: {
    dirs: [CRUSH_SKILLS_DIR],
    files: [CRUSH_ROOT_FILE, CRUSH_IGNORE],
    // Crush's own config file: providers, models and LSP settings the user
    // owns sit beside the keys agentsmesh writes.
    coOwnedFiles: [CRUSH_CONFIG_FILE],
  },
  paths: {
    rulePath(_slug) {
      return CRUSH_ROOT_FILE;
    },
    commandPath(name) {
      return `${CRUSH_SKILLS_DIR}/${commandSkillDirName(name)}/SKILL.md`;
    },
    agentPath(name) {
      return `${CRUSH_SKILLS_DIR}/${projectedAgentSkillDirName(name)}/SKILL.md`;
    },
  },
};

const globalLayout: TargetLayout = {
  rootInstructionPath: CRUSH_GLOBAL_ROOT_FILE,
  skillDir: CRUSH_GLOBAL_SKILLS_DIR,
  managedOutputs: {
    dirs: [CRUSH_GLOBAL_SKILLS_DIR],
    files: [CRUSH_GLOBAL_ROOT_FILE, CRUSH_GLOBAL_IGNORE],
    coOwnedFiles: [CRUSH_GLOBAL_CONFIG_FILE],
  },
  rewriteGeneratedPath(path) {
    if (path === CRUSH_ROOT_FILE) return CRUSH_GLOBAL_ROOT_FILE;
    if (path === CRUSH_CONFIG_FILE) return CRUSH_GLOBAL_CONFIG_FILE;
    if (path === CRUSH_IGNORE) return CRUSH_GLOBAL_IGNORE;
    if (path.startsWith(`${CRUSH_SKILLS_DIR}/`)) {
      return path.replace(`${CRUSH_SKILLS_DIR}/`, `${CRUSH_GLOBAL_SKILLS_DIR}/`);
    }
    return path;
  },
  mirrorGlobalPath(path, activeTargets) {
    return mirrorSkillsToAgents(path, CRUSH_GLOBAL_SKILLS_DIR, activeTargets);
  },
  paths: {
    rulePath(_slug) {
      return CRUSH_GLOBAL_ROOT_FILE;
    },
    commandPath(name) {
      return `${CRUSH_GLOBAL_SKILLS_DIR}/${commandSkillDirName(name)}/SKILL.md`;
    },
    agentPath(name) {
      return `${CRUSH_GLOBAL_SKILLS_DIR}/${projectedAgentSkillDirName(name)}/SKILL.md`;
    },
  },
};

const capabilities: TargetCapabilities = {
  rules: 'native',
  additionalRules: 'embedded',
  commands: 'embedded',
  agents: 'none',
  skills: 'native',
  mcp: 'native',
  hooks: 'native',
  ignore: 'native',
  permissions: 'native',
};

const globalCapabilities: TargetCapabilities = {
  rules: 'native',
  additionalRules: 'embedded',
  commands: 'embedded',
  agents: 'none',
  skills: 'native',
  mcp: 'native',
  hooks: 'native',
  ignore: 'native',
  permissions: 'native',
};

export const descriptor = {
  id: CRUSH_TARGET,
  metadata: {
    displayName: 'Crush',
    category: 'cli',
    officialUrl: 'https://github.com/charmbracelet/crush',
    shortDescription: "Charm's TUI coding agent",
  },
  generators: target,
  capabilities,
  emptyImportMessage:
    'No Crush config found (CRUSH.md, .crush/skills/, crush.json, or .crushignore).',
  lintRules,
  lint: { commands: lintCommands },
  supportsConversion: { commands: true, agents: true },
  project,
  globalSupport: {
    capabilities: globalCapabilities,
    detectionPaths: [
      CRUSH_GLOBAL_ROOT_FILE,
      CRUSH_GLOBAL_CONFIG_FILE,
      CRUSH_GLOBAL_SKILLS_DIR,
      CRUSH_GLOBAL_IGNORE,
    ],
    layout: globalLayout,
  },
  mergeGeneratedOutputContent(existing, pending, newContent, resolvedPath) {
    const base = pending?.content ?? existing;
    const isCrushConfig =
      resolvedPath === CRUSH_CONFIG_FILE || resolvedPath === CRUSH_GLOBAL_CONFIG_FILE;
    return base !== null && isCrushConfig ? mergeCrushConfigJson(base, newContent) : null;
  },
  importer: {
    rules: {
      feature: 'rules',
      mode: 'singleFile',
      source: {
        project: [CRUSH_ROOT_FILE],
        global: [CRUSH_GLOBAL_ROOT_FILE],
      },
      canonicalDir: AB_RULES,
      canonicalRootFilename: '_root.md',
      markAsRoot: true,
    },
    ignore: {
      feature: 'ignore',
      mode: 'flatFile',
      source: {
        project: [CRUSH_IGNORE],
        global: [CRUSH_GLOBAL_IGNORE],
      },
      canonicalDir: '.agentsmesh',
      canonicalFilename: AB_IGNORE,
    },
  },
  buildImportPaths: buildCrushImportPaths,
  detectionPaths: [CRUSH_ROOT_FILE, CRUSH_CONFIG_FILE, CRUSH_SKILLS_DIR, CRUSH_IGNORE],
  sharedArtifacts: {
    '.crush/skills/': 'owner',
  },
} satisfies TargetDescriptor;
