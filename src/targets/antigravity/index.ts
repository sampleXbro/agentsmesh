import { AB_AGENTS, AB_COMMANDS, AB_RULES } from '../../core/canonical-paths.js';
import type { TargetGenerators } from '../catalog/target.interface.js';
import type { TargetDescriptor } from '../catalog/target-descriptor.js';
import {
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateHooks,
  generateIgnore,
  generatePermissions,
} from './generator.js';
import {
  ANTIGRAVITY_AGENTS_DIR,
  ANTIGRAVITY_GLOBAL_AGENTS_DIR,
  ANTIGRAVITY_GLOBAL_MCP_CONFIG,
  ANTIGRAVITY_GLOBAL_ROOT,
  ANTIGRAVITY_GLOBAL_SETTINGS_FILE,
  ANTIGRAVITY_GLOBAL_SKILLS_DIR,
  ANTIGRAVITY_GLOBAL_WORKFLOWS_DIR,
  ANTIGRAVITY_IGNORE_FILE,
  ANTIGRAVITY_RULES_ROOT,
  ANTIGRAVITY_RULES_DIR,
  ANTIGRAVITY_WORKFLOWS_DIR,
  ANTIGRAVITY_CANONICAL_IGNORE_FILENAME,
} from './constants.js';
import { projectCapabilities, globalCapabilities } from './capabilities.js';
import { importFromAntigravity } from './importer.js';
import { agentMapper, nonRootRuleMapper, workflowMapper } from './import-mappers.js';
import { projectLayout, globalLayout } from './layout.js';
import { emitAntigravityMcp, mergeAntigravityMcpContent } from './mcp-settings.js';
import { mergeAntigravityHooks } from './hooks-merge.js';
import { generateAntigravityGlobalPermissions } from './global-permissions.js';
import { lintRules } from './linter.js';
import { lintAgents, lintMcp, lintPermissions } from './lint.js';
import { buildAntigravityImportPaths } from '../../core/reference/import-map-builders.js';

export const target: TargetGenerators = {
  name: 'antigravity',
  primaryRootInstructionPath: ANTIGRAVITY_RULES_ROOT,
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  // No `generateMcp`: MCP is emitted from `emitScopedSettings` so the merge
  // callback can keep Antigravity-only server keys (see mcp-settings.ts).
  generateHooks,
  generateIgnore,
  generatePermissions,
  importFrom: importFromAntigravity,
  lint: lintAgents,
};

export const descriptor = {
  id: 'antigravity',
  metadata: {
    displayName: 'Antigravity',
    category: 'ide',
    officialUrl: 'https://antigravity.google',
    shortDescription: "Google's agentic IDE",
  },
  generators: target,
  capabilities: projectCapabilities,
  emptyImportMessage:
    'No Antigravity config found (.agents/rules/, .agents/agents/, .agents/skills/, or .agents/workflows/).',
  lintRules,
  lint: {
    mcp: lintMcp,
    permissions: lintPermissions,
  },
  emitScopedSettings: emitAntigravityMcp,
  mergeGeneratedOutputContent: (existing, pending, newContent, resolvedPath) =>
    mergeAntigravityMcpContent(existing, pending, newContent, resolvedPath) ??
    mergeAntigravityHooks(existing, pending, newContent, resolvedPath),
  project: projectLayout,
  globalSupport: {
    capabilities: globalCapabilities,
    detectionPaths: [
      ANTIGRAVITY_GLOBAL_ROOT,
      ANTIGRAVITY_GLOBAL_SKILLS_DIR,
      ANTIGRAVITY_GLOBAL_WORKFLOWS_DIR,
      ANTIGRAVITY_GLOBAL_AGENTS_DIR,
      ANTIGRAVITY_GLOBAL_MCP_CONFIG,
      ANTIGRAVITY_GLOBAL_SETTINGS_FILE,
    ],
    layout: globalLayout,
    scopeExtras: (canonical, projectRoot, scope, enabledFeatures) =>
      scope === 'global'
        ? generateAntigravityGlobalPermissions(canonical, projectRoot, enabledFeatures)
        : Promise.resolve([]),
  },
  importer: {
    rules: {
      // Project-only directory scan; root rule + global-aggregated rules
      // (which collapse into the single .gemini/GEMINI.md) are
      // handled imperatively in importer.ts.
      feature: 'rules',
      mode: 'directory',
      source: { project: [ANTIGRAVITY_RULES_DIR] },
      canonicalDir: AB_RULES,
      extensions: ['.md'],
      map: nonRootRuleMapper,
    },
    commands: {
      feature: 'commands',
      mode: 'directory',
      source: {
        project: [ANTIGRAVITY_WORKFLOWS_DIR],
        global: [ANTIGRAVITY_GLOBAL_WORKFLOWS_DIR],
      },
      canonicalDir: AB_COMMANDS,
      extensions: ['.md'],
      map: workflowMapper,
    },
    agents: {
      // Global nests one directory per agent (`<name>/agent.md`); the mapper
      // flattens that back to a single canonical `<name>.md`.
      feature: 'agents',
      mode: 'directory',
      source: {
        project: [ANTIGRAVITY_AGENTS_DIR],
        global: [ANTIGRAVITY_GLOBAL_AGENTS_DIR],
      },
      canonicalDir: AB_AGENTS,
      extensions: ['.md'],
      map: agentMapper,
    },
    ignore: {
      // Copied verbatim, so comments and negated patterns reach `.agentsmesh/ignore`
      // intact. Only the patterns come back out: loading canonical drops comments
      // and blank lines (`canonical/features/ignore.ts`), so regenerating writes a
      // comment-free file. That is the shared canonical model, not a target choice.
      feature: 'ignore',
      mode: 'flatFile',
      source: { project: [ANTIGRAVITY_IGNORE_FILE] },
      canonicalDir: '.agentsmesh',
      canonicalFilename: ANTIGRAVITY_CANONICAL_IGNORE_FILENAME,
    },
  },
  buildImportPaths: buildAntigravityImportPaths,
  detectionPaths: [
    '.agents/rules/general.md',
    '.agents/rules/',
    '.agents/agents/',
    '.agents/skills/',
    '.agents/workflows/',
    '.agents/mcp_config.json',
    ANTIGRAVITY_IGNORE_FILE,
  ],
} satisfies TargetDescriptor;
