import { AB_COMMANDS, AB_IGNORE, AB_MCP, AB_RULES } from '../../core/canonical-paths.js';
import type { TargetGenerators } from '../catalog/target.interface.js';
import type { TargetDescriptor } from '../catalog/target-descriptor.js';
import {
  generateRules,
  generateCommands,
  generateSkills,
  generateMcp,
  generateIgnore,
  generateAgents,
  generatePermissions,
} from './generator.js';
import {
  ROO_CODE_ROOT_RULE,
  ROO_CODE_ROOT_RULE_FALLBACK,
  ROO_CODE_RULES_DIR,
  ROO_CODE_COMMANDS_DIR,
  ROO_CODE_MCP_FILE,
  ROO_CODE_IGNORE,
  ROO_CODE_MODES_FILE,
  ROO_CODE_GLOBAL_RULES_DIR,
  ROO_CODE_GLOBAL_COMMANDS_DIR,
  ROO_CODE_GLOBAL_SKILLS_DIR,
  ROO_CODE_GLOBAL_MCP_FILE,
  ROO_CODE_GLOBAL_AGENTS_MD,
  ROO_CODE_GLOBAL_MODES_FILE,
} from './constants.js';
import {
  project,
  globalLayout,
  capabilities,
  globalCapabilities,
  generateRooGlobalExtras,
} from './layout.js';
import { mergeRooCodeSettings, mergeRooProjectMcpJson } from './merge.js';
import { mergeRooCustomModesYaml } from './modes-merge.js';
import { importFromRooCode } from './importer.js';
import { rooCommandMapper, rooNonRootRuleMapper } from './import-mappers.js';
import { lintRules } from './linter.js';
import { lintPermissions, lintIgnore } from './lint.js';
import { buildRooCodeImportPaths } from '../../core/reference/import-map-builders.js';

export const target: TargetGenerators = {
  name: 'roo-code',
  primaryRootInstructionPath: ROO_CODE_ROOT_RULE,
  generateRules,
  generateCommands,
  generateSkills,
  generateMcp,
  generateIgnore,
  generateAgents,
  generatePermissions,
  importFrom: importFromRooCode,
};

export const descriptor = {
  id: 'roo-code',
  metadata: {
    displayName: 'Roo Code',
    category: 'ide',
    officialUrl: 'https://roocode.com',
    shortDescription: 'Open-source AI VS Code extension',
  },
  generators: target,
  capabilities,
  emptyImportMessage:
    'No Roo Code config found (.roo/rules, .roo/commands, .roo/skills, .roo/mcp.json, .rooignore, or .roorules).',
  lintRules,
  lint: { permissions: lintPermissions, ignore: lintIgnore },
  project,
  globalSupport: {
    capabilities: globalCapabilities,
    detectionPaths: [
      ROO_CODE_GLOBAL_RULES_DIR,
      ROO_CODE_GLOBAL_COMMANDS_DIR,
      ROO_CODE_GLOBAL_SKILLS_DIR,
      ROO_CODE_GLOBAL_MCP_FILE,
      ROO_CODE_GLOBAL_MODES_FILE,
    ],
    layout: globalLayout,
    scopeExtras: generateRooGlobalExtras,
  },
  importer: {
    rules: [
      {
        // Root rule: `.roo/rules/00-root.md` (both scopes), then flat `.roorules`
        // fallback. Legacy `.roo/AGENTS.md` is tried last for global scope only —
        // a prior agentsmesh version wrote there, but Roo Code itself never reads
        // it (loadAllAgentRulesFiles only checks cwd, never the home directory).
        feature: 'rules',
        mode: 'singleFile',
        source: {
          project: [ROO_CODE_ROOT_RULE, ROO_CODE_ROOT_RULE_FALLBACK],
          global: [ROO_CODE_ROOT_RULE, ROO_CODE_ROOT_RULE_FALLBACK, ROO_CODE_GLOBAL_AGENTS_MD],
        },
        canonicalDir: AB_RULES,
        canonicalRootFilename: '_root.md',
        markAsRoot: true,
        // Drop Roo-specific frontmatter fields; keep only canonical ones.
        frontmatterRemap: ({ description, globs }) => ({
          description: typeof description === 'string' ? description : undefined,
          globs: Array.isArray(globs) ? globs : undefined,
        }),
      },
      {
        // Non-root rule directory scan (skips `00-root.md`, handled above).
        feature: 'rules',
        mode: 'directory',
        source: { project: [ROO_CODE_RULES_DIR], global: [ROO_CODE_GLOBAL_RULES_DIR] },
        canonicalDir: AB_RULES,
        extensions: ['.md'],
        map: rooNonRootRuleMapper,
      },
    ],
    commands: {
      feature: 'commands',
      mode: 'directory',
      source: { project: [ROO_CODE_COMMANDS_DIR], global: [ROO_CODE_GLOBAL_COMMANDS_DIR] },
      canonicalDir: AB_COMMANDS,
      extensions: ['.md'],
      map: rooCommandMapper,
    },
    mcp: {
      feature: 'mcp',
      mode: 'mcpJson',
      source: { project: [ROO_CODE_MCP_FILE], global: [ROO_CODE_GLOBAL_MCP_FILE] },
      canonicalDir: '.agentsmesh',
      canonicalFilename: AB_MCP,
    },
    ignore: {
      feature: 'ignore',
      mode: 'flatFile',
      // Project-only: Roo Code's RooIgnoreController only reads `.rooignore`
      // from the open workspace; there is no global ignore concept.
      source: { project: [ROO_CODE_IGNORE] },
      canonicalDir: '.agentsmesh',
      canonicalFilename: AB_IGNORE,
    },
  },
  mergeGeneratedOutputContent: (existing, pending, newContent, resolvedPath) =>
    mergeRooCodeSettings(existing, pending, newContent, resolvedPath) ??
    mergeRooCustomModesYaml(existing, pending, newContent, resolvedPath) ??
    mergeRooProjectMcpJson(existing, pending, newContent, resolvedPath),
  buildImportPaths: buildRooCodeImportPaths,
  detectionPaths: [
    '.roo/rules',
    '.roo/commands',
    '.roo/skills',
    '.roo/mcp.json',
    '.rooignore',
    '.roorules',
    ROO_CODE_MODES_FILE,
  ],
} satisfies TargetDescriptor;
