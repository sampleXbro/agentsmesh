import { AB_AGENTS, AB_IGNORE, AB_MCP } from '../../core/canonical-paths.js';
import type { TargetCapabilities, TargetGenerators } from '../catalog/target.interface.js';
import type { TargetDescriptor } from '../catalog/target-descriptor.js';
import {
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateMcp,
  generateHooks,
  generateIgnore,
  generatePermissions,
} from './generator.js';
import { projectLayout, globalLayout } from './layout.js';
import { emitKiroAgentPermissions, generateKiroGlobalPermissions } from './permissions-generate.js';
import { importFromKiro } from './importer.js';
import { mergeKiroMcpJson } from './merge.js';
import { lintRules } from './linter.js';
import { lintHooks, lintPermissions } from './lint.js';
import { buildKiroImportPaths } from '../../core/reference/import-map-builders.js';
import {
  KIRO_TARGET,
  KIRO_AGENTS_MD,
  KIRO_STEERING_DIR,
  KIRO_SKILLS_DIR,
  KIRO_AGENTS_DIR,
  KIRO_HOOKS_DIR,
  KIRO_MCP_FILE,
  KIRO_IGNORE,
  KIRO_GLOBAL_STEERING_DIR,
  KIRO_GLOBAL_STEERING_AGENTS_MD,
  KIRO_GLOBAL_SKILLS_DIR,
  KIRO_GLOBAL_AGENTS_DIR,
  KIRO_GLOBAL_MCP_FILE,
  KIRO_GLOBAL_IGNORE,
  KIRO_GLOBAL_PERMISSIONS_FILE,
} from './constants.js';

export const target: TargetGenerators = {
  name: KIRO_TARGET,
  primaryRootInstructionPath: KIRO_AGENTS_MD,
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateMcp,
  generateHooks,
  generateIgnore,
  generatePermissions,
  importFrom: importFromKiro,
};

const globalCapabilities: TargetCapabilities = {
  rules: 'native',
  additionalRules: 'native',
  commands: 'embedded',
  agents: 'native',
  skills: 'native',
  mcp: 'native',
  hooks: 'partial',
  ignore: 'native',
  permissions: 'native',
};

export const descriptor = {
  mergeGeneratedOutputContent: mergeKiroMcpJson,
  id: KIRO_TARGET,
  metadata: {
    displayName: 'Kiro',
    category: 'ide',
    officialUrl: 'https://kiro.dev',
    shortDescription: 'AWS spec-driven AI IDE',
  },
  generators: target,
  capabilities: {
    rules: 'native',
    additionalRules: 'native',
    commands: 'embedded',
    agents: 'native',
    skills: 'native',
    mcp: 'native',
    hooks: 'native',
    ignore: 'native',
    // No in-repo permissions file: rules ride in the `.kiro/agents/` profiles.
    permissions: 'embedded',
  },
  emptyImportMessage:
    'No Kiro config found (AGENTS.md, .kiro/steering, .kiro/skills, .kiro/agents, .kiro/hooks, .kiro/settings/mcp.json, or .kiroignore).',
  supportsConversion: { commands: true },
  lintRules,
  lint: {
    hooks: lintHooks,
    permissions: lintPermissions,
  },
  emitScopedSettings: emitKiroAgentPermissions,
  project: projectLayout,
  globalSupport: {
    capabilities: globalCapabilities,
    detectionPaths: [
      KIRO_GLOBAL_STEERING_DIR,
      KIRO_GLOBAL_STEERING_AGENTS_MD,
      KIRO_GLOBAL_SKILLS_DIR,
      KIRO_GLOBAL_AGENTS_DIR,
      KIRO_GLOBAL_MCP_FILE,
      KIRO_GLOBAL_IGNORE,
      KIRO_GLOBAL_PERMISSIONS_FILE,
    ],
    layout: globalLayout,
    scopeExtras: generateKiroGlobalPermissions,
  },
  importer: {
    agents: {
      feature: 'agents',
      mode: 'directory',
      source: { project: [KIRO_AGENTS_DIR], global: [KIRO_AGENTS_DIR] },
      canonicalDir: AB_AGENTS,
      extensions: ['.md'],
      preset: 'agent',
    },
    mcp: {
      feature: 'mcp',
      mode: 'mcpJson',
      source: { project: [KIRO_MCP_FILE], global: [KIRO_GLOBAL_MCP_FILE] },
      canonicalDir: '.agentsmesh',
      canonicalFilename: AB_MCP,
    },
    ignore: {
      feature: 'ignore',
      mode: 'flatFile',
      source: { project: [KIRO_IGNORE], global: [KIRO_GLOBAL_IGNORE] },
      canonicalDir: '.agentsmesh',
      canonicalFilename: AB_IGNORE,
    },
  },
  buildImportPaths: buildKiroImportPaths,
  detectionPaths: [
    KIRO_STEERING_DIR,
    KIRO_SKILLS_DIR,
    KIRO_AGENTS_DIR,
    KIRO_HOOKS_DIR,
    KIRO_MCP_FILE,
    KIRO_IGNORE,
  ],
  conversionDefaults: { commandsToSkills: true },
} satisfies TargetDescriptor;
