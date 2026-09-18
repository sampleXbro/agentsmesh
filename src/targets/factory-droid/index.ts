/**
 * Factory Droid target descriptor.
 *
 * Generation emits:
 *   - `AGENTS.md`            — root rule + embedded additional rules
 *   - `.factory/commands/`   — native slash commands
 *   - `.factory/skills/`     — skill bundles
 *   - `.factory/droids/`     — native droid definitions from canonical agents
 *   - `.factory/mcp.json`    — MCP servers
 *   - `.factory/hooks.json`  — command hooks (primary surface per Factory Droid docs)
 *   - `.factory/settings.json` — permissions (commandAllowlist / commandDenylist)
 *
 * Import reads `AGENTS.md`, `.factory/commands/`, `.factory/droids/`,
 * `.factory/skills/`, `.factory/mcp.json`, `.factory/hooks.json`, and
 * `.factory/settings.json`.
 *
 * Factory Droid has native support for commands, agents (droids), skills, MCP,
 * hooks, and permissions. Ignore has no file-based config — a lint warning is
 * emitted when ignore patterns are present.
 */

import { AB_AGENTS, AB_COMMANDS, AB_RULES } from '../../core/canonical-paths.js';
import type { TargetCapabilities, TargetGenerators } from '../catalog/target.interface.js';
import type { TargetDescriptor, TargetLayout } from '../catalog/target-descriptor.js';
import {
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateMcp,
  generateHooks,
  generatePermissions,
  generateIgnore,
} from './generator.js';
import {
  FACTORY_DROID_TARGET,
  FACTORY_DROID_ROOT_FILE,
  FACTORY_DROID_SKILLS_DIR,
  FACTORY_DROID_COMMANDS_DIR,
  FACTORY_DROID_DROIDS_DIR,
  FACTORY_DROID_MCP_FILE,
  FACTORY_DROID_HOOKS_FILE,
  FACTORY_DROID_SETTINGS_FILE,
  FACTORY_DROID_GLOBAL_ROOT_FILE,
  FACTORY_DROID_GLOBAL_SKILLS_DIR,
  FACTORY_DROID_GLOBAL_COMMANDS_DIR,
  FACTORY_DROID_GLOBAL_DROIDS_DIR,
  FACTORY_DROID_GLOBAL_MCP_FILE,
  FACTORY_DROID_GLOBAL_HOOKS_FILE,
  FACTORY_DROID_GLOBAL_SETTINGS_FILE,
} from './constants.js';
import { importFromFactoryDroid } from './importer.js';
import { mergeFactoryDroidOutput } from './merge.js';
import { lintRules } from './linter.js';
import { lintIgnore } from './lint.js';
import { buildFactoryDroidImportPaths } from '../../core/reference/import-map-builders.js';

export const target: TargetGenerators = {
  name: FACTORY_DROID_TARGET,
  primaryRootInstructionPath: FACTORY_DROID_ROOT_FILE,
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateMcp,
  generateHooks,
  generatePermissions,
  generateIgnore,
  importFrom: importFromFactoryDroid,
};

const project: TargetLayout = {
  rootInstructionPath: FACTORY_DROID_ROOT_FILE,
  skillDir: FACTORY_DROID_SKILLS_DIR,
  managedOutputs: {
    dirs: [FACTORY_DROID_SKILLS_DIR, FACTORY_DROID_COMMANDS_DIR, FACTORY_DROID_DROIDS_DIR],
    files: [FACTORY_DROID_ROOT_FILE],
    // `droid` creates settings.json with defaults on first run and the `/hooks`
    // manager saves hooks.json; `droid mcp add` writes mcp.json. agentsmesh
    // owns only its keys inside each (see merge.ts).
    coOwnedFiles: [FACTORY_DROID_HOOKS_FILE, FACTORY_DROID_SETTINGS_FILE, FACTORY_DROID_MCP_FILE],
  },
  paths: {
    rulePath(_slug) {
      return FACTORY_DROID_ROOT_FILE;
    },
    commandPath(name) {
      return `${FACTORY_DROID_COMMANDS_DIR}/${name}.md`;
    },
    agentPath(name) {
      return `${FACTORY_DROID_DROIDS_DIR}/${name}.md`;
    },
  },
};

const globalLayout: TargetLayout = {
  rootInstructionPath: FACTORY_DROID_GLOBAL_ROOT_FILE,
  skillDir: FACTORY_DROID_GLOBAL_SKILLS_DIR,
  managedOutputs: {
    dirs: [
      FACTORY_DROID_GLOBAL_SKILLS_DIR,
      FACTORY_DROID_GLOBAL_COMMANDS_DIR,
      FACTORY_DROID_GLOBAL_DROIDS_DIR,
    ],
    files: [FACTORY_DROID_GLOBAL_ROOT_FILE],
    coOwnedFiles: [
      FACTORY_DROID_GLOBAL_HOOKS_FILE,
      FACTORY_DROID_GLOBAL_SETTINGS_FILE,
      FACTORY_DROID_GLOBAL_MCP_FILE,
    ],
  },
  rewriteGeneratedPath(path) {
    if (path === FACTORY_DROID_ROOT_FILE) return FACTORY_DROID_GLOBAL_ROOT_FILE;
    if (path === FACTORY_DROID_MCP_FILE) return FACTORY_DROID_GLOBAL_MCP_FILE;
    if (path.startsWith(`${FACTORY_DROID_SKILLS_DIR}/`)) {
      return path.replace(`${FACTORY_DROID_SKILLS_DIR}/`, `${FACTORY_DROID_GLOBAL_SKILLS_DIR}/`);
    }
    if (path.startsWith(`${FACTORY_DROID_DROIDS_DIR}/`)) {
      return path.replace(`${FACTORY_DROID_DROIDS_DIR}/`, `${FACTORY_DROID_GLOBAL_DROIDS_DIR}/`);
    }
    return path;
  },
  paths: {
    rulePath(_slug) {
      return FACTORY_DROID_GLOBAL_ROOT_FILE;
    },
    commandPath(name) {
      return `${FACTORY_DROID_GLOBAL_COMMANDS_DIR}/${name}.md`;
    },
    agentPath(name) {
      return `${FACTORY_DROID_GLOBAL_DROIDS_DIR}/${name}.md`;
    },
  },
};

const capabilities: TargetCapabilities = {
  rules: 'native',
  additionalRules: 'embedded',
  commands: 'native',
  agents: 'native',
  skills: 'native',
  mcp: 'native',
  hooks: 'native',
  ignore: 'partial',
  permissions: 'native',
};

export const descriptor = {
  mergeGeneratedOutputContent: mergeFactoryDroidOutput,
  id: FACTORY_DROID_TARGET,
  metadata: {
    displayName: 'Factory Droid',
    category: 'agent-platform',
    officialUrl: 'https://www.factory.ai',
    shortDescription: "Factory.ai's coding droid",
  },
  generators: target,
  capabilities,
  emptyImportMessage:
    'No Factory Droid config found (AGENTS.md, .factory/skills, or .factory/mcp.json).',
  lintRules,
  lint: {
    ignore: lintIgnore,
  },
  project,
  globalSupport: {
    capabilities,
    detectionPaths: [
      FACTORY_DROID_GLOBAL_ROOT_FILE,
      FACTORY_DROID_GLOBAL_MCP_FILE,
      FACTORY_DROID_GLOBAL_DROIDS_DIR,
    ],
    layout: globalLayout,
  },
  importer: {
    rules: {
      feature: 'rules',
      mode: 'singleFile',
      source: {
        project: [FACTORY_DROID_ROOT_FILE],
        global: [FACTORY_DROID_GLOBAL_ROOT_FILE],
      },
      canonicalDir: AB_RULES,
      canonicalRootFilename: '_root.md',
      markAsRoot: true,
    },
    commands: {
      feature: 'commands',
      mode: 'directory',
      source: {
        project: [FACTORY_DROID_COMMANDS_DIR],
        global: [FACTORY_DROID_GLOBAL_COMMANDS_DIR],
      },
      canonicalDir: AB_COMMANDS,
      extensions: ['.md'],
      preset: 'command',
    },
    agents: {
      feature: 'agents',
      mode: 'directory',
      source: {
        project: [FACTORY_DROID_DROIDS_DIR],
        global: [FACTORY_DROID_GLOBAL_DROIDS_DIR],
      },
      canonicalDir: AB_AGENTS,
      extensions: ['.md'],
      preset: 'agent',
    },
  },
  buildImportPaths: buildFactoryDroidImportPaths,
  detectionPaths: [FACTORY_DROID_ROOT_FILE, FACTORY_DROID_MCP_FILE, FACTORY_DROID_DROIDS_DIR],
} satisfies TargetDescriptor;
