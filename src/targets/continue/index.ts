import { AB_AGENTS, AB_COMMANDS, AB_IGNORE, AB_RULES } from '../../core/canonical-paths.js';
import type { TargetGenerators } from '../catalog/target.interface.js';
import type { TargetDescriptor } from '../catalog/target-descriptor.js';
import {
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateMcp,
  generateIgnore,
} from './generator.js';
import { generateHooks, mergeContinueSettings } from './hooks.js';
import { mergeContinueGlobalYaml } from './config-merge.js';
import { globalCapabilities, projectCapabilities } from './capabilities.js';
import { globalLayout, projectLayout } from './layout.js';
import {
  CONTINUE_ROOT_RULE,
  CONTINUE_RULES_DIR,
  CONTINUE_PROMPTS_DIR,
  CONTINUE_AGENTS_DIR,
  CONTINUE_SKILLS_DIR,
  CONTINUE_IGNORE,
  CONTINUE_GLOBAL_IGNORE,
} from './constants.js';
import { importFromContinue } from './importer.js';
import {
  continueAgentMapper,
  continueCommandMapper,
  continueRuleMapper,
} from './import-mappers.js';
import { lintRules } from './linter.js';
import { lintAgents, lintCommands, lintHooks } from './lint.js';
import { buildContinueImportPaths } from '../../core/reference/import-map-builders.js';
import { generateContinueScopeExtras } from './scope-extras.js';

export const target: TargetGenerators = {
  name: 'continue',
  primaryRootInstructionPath: CONTINUE_ROOT_RULE,
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateMcp,
  generateHooks,
  generateIgnore,
  // Feature-independent lint hook: agent warnings must not hang off `rules`.
  lint: lintAgents,
  importFrom: importFromContinue,
};

export const descriptor = {
  id: 'continue',
  metadata: {
    displayName: 'Continue',
    category: 'ide',
    officialUrl: 'https://continue.dev',
    shortDescription: 'Open-source AI code assistant',
  },
  generators: target,
  capabilities: projectCapabilities,
  emptyImportMessage:
    'No Continue config found (.continue/rules/*.md, .continue/agents, .continue/skills, or .continue/mcpServers/*).',
  lintRules,
  lint: {
    commands: lintCommands,
    hooks: lintHooks,
  },
  project: projectLayout,
  globalSupport: {
    capabilities: globalCapabilities,
    detectionPaths: [
      CONTINUE_RULES_DIR,
      CONTINUE_PROMPTS_DIR,
      '.continue/mcpServers',
      CONTINUE_SKILLS_DIR,
      CONTINUE_AGENTS_DIR,
    ],
    layout: globalLayout,
    scopeExtras: generateContinueScopeExtras,
  },
  mergeGeneratedOutputContent: (existing, pending, newContent, resolvedPath) =>
    mergeContinueSettings(existing, pending, newContent, resolvedPath) ??
    mergeContinueGlobalYaml(existing, pending, newContent, resolvedPath),
  importer: {
    rules: {
      feature: 'rules',
      mode: 'directory',
      source: { project: [CONTINUE_RULES_DIR], global: [CONTINUE_RULES_DIR] },
      canonicalDir: AB_RULES,
      extensions: ['.md'],
      map: continueRuleMapper,
    },
    commands: {
      feature: 'commands',
      mode: 'directory',
      source: { project: [CONTINUE_PROMPTS_DIR], global: [CONTINUE_PROMPTS_DIR] },
      canonicalDir: AB_COMMANDS,
      extensions: ['.md'],
      map: continueCommandMapper,
    },
    // `.md` only, at both scopes, matching `nativeInstall` below: YAML under
    // `.continue/agents` is a user-owned assistant profile, not an agent.
    agents: {
      feature: 'agents',
      mode: 'directory',
      source: { project: [CONTINUE_AGENTS_DIR], global: [CONTINUE_AGENTS_DIR] },
      canonicalDir: AB_AGENTS,
      extensions: ['.md'],
      map: continueAgentMapper,
    },
    ignore: {
      feature: 'ignore',
      mode: 'flatFile',
      source: {
        project: [CONTINUE_IGNORE],
        global: [CONTINUE_GLOBAL_IGNORE],
      },
      canonicalDir: '.agentsmesh',
      canonicalFilename: AB_IGNORE,
    },
  },
  buildImportPaths: buildContinueImportPaths,
  detectionPaths: [
    CONTINUE_RULES_DIR,
    CONTINUE_AGENTS_DIR,
    CONTINUE_SKILLS_DIR,
    '.continue/mcpServers',
  ],
  nativeInstall: {
    pickPaths: [
      {
        prefix: CONTINUE_RULES_DIR,
        feature: 'rules',
        strategy: { kind: 'basename', suffix: '.md' },
      },
      {
        prefix: CONTINUE_PROMPTS_DIR,
        feature: 'commands',
        strategy: { kind: 'basename', suffix: '.md' },
      },
      {
        prefix: CONTINUE_AGENTS_DIR,
        feature: 'agents',
        strategy: { kind: 'basename', suffix: '.md' },
      },
      { prefix: CONTINUE_SKILLS_DIR, feature: 'skills', strategy: { kind: 'skillDir' } },
    ],
  },
} satisfies TargetDescriptor;
