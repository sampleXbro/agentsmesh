import { AB_COMMANDS, AB_RULES } from '../../core/canonical-paths.js';
import type { TargetGenerators, TargetCapabilities } from '../catalog/target.interface.js';
import type { TargetDescriptor } from '../catalog/target-descriptor.js';
import {
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateIgnore,
} from './generator.js';
import { cap } from '../catalog/capabilities.js';
import { generateGeminiScopeExtras } from './scope-extras.js';
import { mergeGeminiPolicyRules } from './policies-merge.js';
import { projectLayout, globalLayout } from './layout.js';
import {
  GEMINI_ROOT,
  GEMINI_COMMANDS_DIR,
  GEMINI_RULES_DIR,
  GEMINI_GLOBAL_ROOT,
  GEMINI_GLOBAL_COMPAT_AGENTS,
  GEMINI_GLOBAL_SETTINGS,
  GEMINI_GLOBAL_COMMANDS_DIR,
  GEMINI_GLOBAL_SKILLS_DIR,
  GEMINI_GLOBAL_AGENTS_DIR,
  GEMINI_SETTINGS,
} from './constants.js';
import { importFromGemini } from './importer.js';
import { inferGeminiPick } from '../../install/native/gemini-install-commands.js';
import { geminiCommandMapper, geminiRuleMapper } from './import-mappers.js';
import { lintRules } from './linter.js';
import { buildGeminiCliImportPaths } from '../../core/reference/import-map-builders.js';
import { lintCommands, lintHooks, lintPermissions } from './lint.js';
import { emitScopedGeminiSettings } from './scoped-settings-emit.js';
import { GEMINI_HOOK_CONTEXT_EVENTS } from './hook-map.js';
import { mergeGeminiSettingsJson } from '../../core/generate/settings.js';

export const target: TargetGenerators = {
  name: 'gemini-cli',
  primaryRootInstructionPath: GEMINI_ROOT,
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateIgnore,
  importFrom: importFromGemini,
};

/**
 * Permissions are `native` globally (`~/.gemini/policies/permissions.toml`) but only
 * `partial` for the project: the policy engine's Workspace tier is non-functional
 * upstream, so a repo-local policy file would never be read.
 */
const globalCapabilities: TargetCapabilities = {
  rules: 'native',
  additionalRules: 'embedded',
  commands: 'native',
  agents: 'native',
  skills: 'native',
  mcp: 'native',
  hooks: 'native',
  ignore: 'none',
  permissions: 'native',
};

export const descriptor = {
  id: 'gemini-cli',
  metadata: {
    displayName: 'Gemini CLI',
    category: 'cli',
    officialUrl: 'https://github.com/google-gemini/gemini-cli',
    shortDescription: "Google's terminal Gemini agent",
  },
  generators: target,
  capabilities: {
    rules: 'native',
    additionalRules: 'embedded',
    commands: 'native',
    agents: 'native',
    skills: 'native',
    mcp: 'native',
    hooks: 'native',
    ignore: cap('native', 'settings-embedded'),
    permissions: 'partial',
  },
  emptyImportMessage:
    'No Gemini CLI config found (GEMINI.md or .gemini/rules, .gemini/commands, .gemini/settings.json).',
  lintRules,
  lint: {
    commands: lintCommands,
    hooks: lintHooks,
    permissions: lintPermissions,
  },
  emitScopedSettings: emitScopedGeminiSettings,
  hookContextEvents: GEMINI_HOOK_CONTEXT_EVENTS,
  mergeGeneratedOutputContent(existing, pending, newContent, resolvedPath) {
    const base = pending?.content ?? existing;
    if (base !== null && resolvedPath === GEMINI_SETTINGS) {
      return mergeGeminiSettingsJson(base, newContent);
    }
    return mergeGeminiPolicyRules(existing, pending, newContent, resolvedPath);
  },
  project: projectLayout,
  globalSupport: {
    capabilities: globalCapabilities,
    detectionPaths: [
      GEMINI_GLOBAL_ROOT,
      GEMINI_GLOBAL_COMPAT_AGENTS,
      GEMINI_GLOBAL_SETTINGS,
      GEMINI_GLOBAL_COMMANDS_DIR,
      GEMINI_GLOBAL_SKILLS_DIR,
      GEMINI_GLOBAL_AGENTS_DIR,
    ],
    layout: globalLayout,
    scopeExtras: generateGeminiScopeExtras,
  },
  importer: {
    rules: {
      feature: 'rules',
      mode: 'directory',
      source: { project: [GEMINI_RULES_DIR] },
      canonicalDir: AB_RULES,
      extensions: ['.md'],
      map: geminiRuleMapper,
    },
    commands: {
      feature: 'commands',
      mode: 'directory',
      source: { project: [GEMINI_COMMANDS_DIR] },
      canonicalDir: AB_COMMANDS,
      extensions: ['.md', '.toml'],
      map: geminiCommandMapper,
    },
  },
  buildImportPaths: buildGeminiCliImportPaths,
  detectionPaths: ['GEMINI.md', '.gemini'],
  nativeInstall: { inferPick: inferGeminiPick },
  conversionDefaults: { agentsToSkills: false },
} satisfies TargetDescriptor;
