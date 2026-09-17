import { AB_AGENTS, AB_COMMANDS, AB_IGNORE, AB_MCP, AB_RULES } from '../../core/canonical-paths.js';
import type { TargetCapabilities, TargetGenerators } from '../catalog/target.interface.js';
import type { TargetDescriptor, TargetLayout } from '../catalog/target-descriptor.js';
import {
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateMcp,
  generateIgnore,
  generatePermissions,
  renderJunieGlobalInstructions,
} from './generator.js';
import { emitJunieScopedSettings } from './global-config.js';
import { mergeJunieOutput } from './merge.js';
import {
  JUNIE_DOT_AGENTS,
  JUNIE_RULES_DIR,
  JUNIE_COMMANDS_DIR,
  JUNIE_AGENTS_DIR,
  JUNIE_MCP_FILE,
  JUNIE_IGNORE,
  JUNIE_GLOBAL_AGENTS_MD,
  JUNIE_GLOBAL_SKILLS_DIR,
  JUNIE_GLOBAL_AGENTS_DIR,
  JUNIE_GLOBAL_COMMANDS_DIR,
  JUNIE_GLOBAL_MCP_FILE,
  JUNIE_GLOBAL_AGENTS_SKILLS_DIR,
  JUNIE_GLOBAL_ALLOWLIST,
  JUNIE_GLOBAL_CONFIG,
  JUNIE_SKILLS_DIR,
} from './constants.js';
import { mirrorSkillsToAgents } from '../catalog/skill-mirror.js';
import { importFromJunie } from './importer.js';
import { lintRules } from './linter.js';
import { lintMcp, lintHooks, lintPermissions } from './lint.js';
import { buildJunieImportPaths } from '../../core/reference/import-map-builders.js';

export const target: TargetGenerators = {
  name: 'junie',
  primaryRootInstructionPath: JUNIE_DOT_AGENTS,
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateMcp,
  generateIgnore,
  generatePermissions,
  importFrom: importFromJunie,
};

const project: TargetLayout = {
  rootInstructionPath: JUNIE_DOT_AGENTS,
  skillDir: '.junie/skills',
  managedOutputs: {
    dirs: ['.junie/agents', '.junie/commands', '.junie/rules', '.junie/skills'],
    files: ['.aiignore', '.junie/AGENTS.md'],
    // Junie's IDE/CLI MCP settings UI writes this file; agentsmesh owns only
    // the server set inside it (see merge.ts).
    coOwnedFiles: [JUNIE_MCP_FILE],
  },
  paths: {
    rulePath(slug, _rule) {
      return `${JUNIE_RULES_DIR}/${slug}.md`;
    },
    commandPath(name, _config) {
      return `${JUNIE_COMMANDS_DIR}/${name}.md`;
    },
    agentPath(name, _config) {
      return `${JUNIE_AGENTS_DIR}/${name}.md`;
    },
  },
};

const globalLayout: TargetLayout = {
  rootInstructionPath: JUNIE_GLOBAL_AGENTS_MD,
  renderPrimaryRootInstruction: renderJunieGlobalInstructions,
  skillDir: JUNIE_GLOBAL_SKILLS_DIR,
  managedOutputs: {
    dirs: [
      JUNIE_GLOBAL_SKILLS_DIR,
      JUNIE_GLOBAL_AGENTS_DIR,
      JUNIE_GLOBAL_COMMANDS_DIR,
      JUNIE_GLOBAL_AGENTS_SKILLS_DIR,
    ],
    files: [JUNIE_GLOBAL_AGENTS_MD],
    // Junie's own config file (model, provider, API keys); the merge keeps
    // every pre-existing key. `allowlist.json` is the persistent Action
    // Allowlist every "Always allow" approval is written into, so agentsmesh
    // owns only `rules.executables` there (see merge.ts).
    coOwnedFiles: [JUNIE_GLOBAL_CONFIG, JUNIE_GLOBAL_MCP_FILE, JUNIE_GLOBAL_ALLOWLIST],
  },
  rewriteGeneratedPath(path) {
    // Transform project-level paths to global ~/.junie/ paths
    if (path === JUNIE_DOT_AGENTS) {
      return JUNIE_GLOBAL_AGENTS_MD;
    }
    if (path.startsWith(`${JUNIE_RULES_DIR}/`)) {
      return JUNIE_GLOBAL_AGENTS_MD; // Aggregate all rules into AGENTS.md
    }
    if (path.startsWith(`${JUNIE_SKILLS_DIR}/`)) {
      return path.replace(`${JUNIE_SKILLS_DIR}/`, `${JUNIE_GLOBAL_SKILLS_DIR}/`);
    }
    if (path.startsWith(`${JUNIE_COMMANDS_DIR}/`)) {
      return path.replace(`${JUNIE_COMMANDS_DIR}/`, `${JUNIE_GLOBAL_COMMANDS_DIR}/`);
    }
    if (path.startsWith(`${JUNIE_AGENTS_DIR}/`)) {
      return path.replace(`${JUNIE_AGENTS_DIR}/`, `${JUNIE_GLOBAL_AGENTS_DIR}/`);
    }
    if (path === JUNIE_MCP_FILE) {
      return JUNIE_GLOBAL_MCP_FILE;
    }
    // .aiignore is not generated in global mode per the spec
    if (path === JUNIE_IGNORE) {
      return null;
    }
    return path;
  },
  mirrorGlobalPath(path, activeTargets) {
    return mirrorSkillsToAgents(path, '.junie/skills', activeTargets);
  },
  paths: {
    rulePath(_slug, _rule) {
      return JUNIE_GLOBAL_AGENTS_MD; // All rules go to AGENTS.md
    },
    commandPath(name, _config) {
      return `${JUNIE_GLOBAL_COMMANDS_DIR}/${name}.md`;
    },
    agentPath(name, _config) {
      return `${JUNIE_GLOBAL_AGENTS_DIR}/${name}.md`;
    },
  },
};

const globalCapabilities: TargetCapabilities = {
  rules: 'native',
  additionalRules: 'embedded',
  commands: 'native',
  agents: 'native',
  skills: 'native',
  mcp: 'native',
  hooks: 'embedded',
  ignore: 'none',
  permissions: 'native',
};

export const descriptor = {
  id: 'junie',
  metadata: {
    displayName: 'Junie',
    category: 'ide',
    officialUrl: 'https://www.jetbrains.com/junie',
    shortDescription: 'JetBrains AI coding agent',
  },
  generators: target,
  capabilities: {
    rules: 'native',
    additionalRules: 'native',
    commands: 'native',
    agents: 'native',
    skills: 'native',
    mcp: 'native',
    hooks: 'partial',
    ignore: 'native',
    permissions: 'partial',
  },
  emptyImportMessage:
    'No Junie config found (.junie/guidelines.md, .junie/AGENTS.md, .junie/skills, .junie/mcp/mcp.json, or .aiignore).',
  lintRules,
  lint: {
    mcp: lintMcp,
    hooks: lintHooks,
    permissions: lintPermissions,
  },
  project,
  globalSupport: {
    capabilities: globalCapabilities,
    detectionPaths: [
      JUNIE_GLOBAL_AGENTS_MD,
      JUNIE_GLOBAL_SKILLS_DIR,
      JUNIE_GLOBAL_AGENTS_DIR,
      JUNIE_GLOBAL_COMMANDS_DIR,
      JUNIE_GLOBAL_MCP_FILE,
    ],
    layout: globalLayout,
  },
  emitScopedSettings: emitJunieScopedSettings,
  mergeGeneratedOutputContent: mergeJunieOutput,
  importer: {
    rules: {
      feature: 'rules',
      mode: 'directory',
      source: { project: ['.junie/rules'] },
      canonicalDir: AB_RULES,
      extensions: ['.md'],
      preset: 'rule',
    },
    commands: {
      feature: 'commands',
      mode: 'directory',
      source: { project: ['.junie/commands'] },
      canonicalDir: AB_COMMANDS,
      extensions: ['.md'],
      preset: 'command',
    },
    agents: {
      feature: 'agents',
      mode: 'directory',
      source: { project: ['.junie/agents'] },
      canonicalDir: AB_AGENTS,
      extensions: ['.md'],
      preset: 'agent',
    },
    mcp: {
      feature: 'mcp',
      mode: 'mcpJson',
      source: { project: [JUNIE_MCP_FILE] },
      canonicalDir: '.agentsmesh',
      canonicalFilename: AB_MCP,
    },
    ignore: {
      feature: 'ignore',
      mode: 'flatFile',
      source: { project: [JUNIE_IGNORE] },
      canonicalDir: '.agentsmesh',
      canonicalFilename: AB_IGNORE,
    },
  },
  buildImportPaths: buildJunieImportPaths,
  detectionPaths: [
    '.junie/guidelines.md',
    '.junie/AGENTS.md',
    '.junie/skills',
    '.junie/mcp/mcp.json',
    '.aiignore',
  ],
  nativeInstall: {
    pickPaths: [
      {
        prefix: '.junie/commands',
        feature: 'commands',
        strategy: { kind: 'basename', suffix: '.md' },
      },
      { prefix: '.junie/rules', feature: 'rules', strategy: { kind: 'basename', suffix: '.md' } },
      {
        prefix: '.junie/agents',
        feature: 'agents',
        strategy: { kind: 'basename', suffix: '.md' },
      },
      { prefix: '.junie/skills', feature: 'skills', strategy: { kind: 'skillDir' } },
    ],
  },
} satisfies TargetDescriptor;
