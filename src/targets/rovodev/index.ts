/**
 * Rovo Dev target descriptor.
 *
 * Generation emits:
 *   - `AGENTS.md`                — root rule + embedded additional rules
 *   - `.rovodev/skills/`         — skill bundles (+ projected agents)
 *   - `.rovodev/prompts.yml`     — saved prompts manifest (custom commands)
 *   - `.rovodev/commands/*.md`   — saved prompt content files
 *   - `.rovodev/config.yml`      — hooks + permissions (global only)
 *   - `~/.rovodev/mcp_config.json` — MCP servers (global only; no
 *     project-level MCP file is documented)
 *
 * Import reads `AGENTS.md`, `.rovodev/skills/`, and `.rovodev/prompts.yml`.
 *
 * Global mode reads/writes `~/.rovodev/AGENTS.md`, `~/.rovodev/skills/`,
 * `~/.rovodev/prompts.yml`, `~/.rovodev/mcp_config.json`, and
 * `~/.rovodev/config.yml`.
 */

import { AB_RULES } from '../../core/canonical-paths.js';
import type { TargetCapabilities, TargetGenerators } from '../catalog/target.interface.js';
import type { TargetDescriptor } from '../catalog/target-descriptor.js';
import type { CanonicalFiles } from '../../core/types.js';
import {
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateMcp,
} from './generator.js';
import { project, globalLayout } from './layout.js';
import { importFromRovodev } from './importer.js';
import { mergeRovodevPromptsYaml } from './prompts-merge.js';
import { lintRules } from './linter.js';
import { lintIgnore, lintMcp } from './lint.js';
import { buildRovodevConfig, mergeRovodevConfig } from './settings.js';
import { mergeRovodevMcpJson } from './mcp-merge.js';
import { buildRovodevImportPaths } from '../../core/reference/import-map-builders.js';
import {
  ROVODEV_TARGET,
  ROVODEV_ROOT_FILE,
  ROVODEV_SKILLS_DIR,
  ROVODEV_PROMPTS_FILE,
  ROVODEV_GLOBAL_DIR,
  ROVODEV_GLOBAL_ROOT_FILE,
  ROVODEV_GLOBAL_SKILLS_DIR,
  ROVODEV_GLOBAL_MCP_FILE,
  ROVODEV_GLOBAL_CONFIG_FILE,
} from './constants.js';

export const target: TargetGenerators = {
  name: ROVODEV_TARGET,
  primaryRootInstructionPath: ROVODEV_ROOT_FILE,
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateMcp,
  importFrom: importFromRovodev,
};

const capabilities: TargetCapabilities = {
  rules: 'native',
  additionalRules: 'embedded',
  commands: 'native',
  agents: 'embedded',
  skills: 'native',
  mcp: 'partial',
  hooks: 'none',
  ignore: 'partial',
  permissions: 'none',
};

const globalCapabilities: TargetCapabilities = {
  rules: 'native',
  additionalRules: 'embedded',
  commands: 'native',
  agents: 'embedded',
  skills: 'native',
  mcp: 'native',
  hooks: 'native',
  ignore: 'partial',
  permissions: 'native',
};

export const descriptor = {
  id: ROVODEV_TARGET,
  metadata: {
    displayName: 'Rovo Dev',
    category: 'cli',
    officialUrl: 'https://www.atlassian.com/solutions/devops/rovo-dev',
    shortDescription: "Atlassian's coding agent",
  },
  generators: target,
  capabilities,
  emptyImportMessage:
    'No Rovo Dev config found (AGENTS.md, .rovodev/skills, or .rovodev/prompts.yml).',
  lintRules,
  lint: {
    ignore: lintIgnore,
    mcp: lintMcp,
  },
  supportsConversion: { agents: true },
  project,
  globalSupport: {
    capabilities: globalCapabilities,
    detectionPaths: [ROVODEV_GLOBAL_DIR, ROVODEV_GLOBAL_ROOT_FILE, ROVODEV_GLOBAL_SKILLS_DIR],
    layout: globalLayout,
  },
  emitScopedSettings(
    canonical: CanonicalFiles,
    scope,
    enabledFeatures,
  ): readonly { readonly path: string; readonly content: string }[] {
    if (scope !== 'global') return [];
    return buildRovodevConfig(canonical, enabledFeatures);
  },
  mergeGeneratedOutputContent(existing, pending, newContent, resolvedPath) {
    if (resolvedPath === ROVODEV_GLOBAL_CONFIG_FILE)
      return mergeRovodevConfig(existing, newContent);
    return (
      mergeRovodevPromptsYaml(existing, pending, newContent, resolvedPath) ??
      mergeRovodevMcpJson(existing, pending, newContent, resolvedPath)
    );
  },
  importer: {
    rules: {
      feature: 'rules',
      mode: 'singleFile',
      source: {
        project: [ROVODEV_ROOT_FILE],
        global: [ROVODEV_GLOBAL_ROOT_FILE],
      },
      canonicalDir: AB_RULES,
      canonicalRootFilename: '_root.md',
      markAsRoot: true,
    },
    // No project-level MCP file is documented — only `~/.rovodev/mcp_config.json`.
    mcp: {
      feature: 'mcp',
      mode: 'mcpJson',
      source: {
        global: [ROVODEV_GLOBAL_MCP_FILE],
      },
      canonicalDir: '.agentsmesh',
      canonicalFilename: 'mcp.json',
    },
  },
  buildImportPaths: buildRovodevImportPaths,
  detectionPaths: [ROVODEV_ROOT_FILE, ROVODEV_SKILLS_DIR, ROVODEV_PROMPTS_FILE],
} satisfies TargetDescriptor;
