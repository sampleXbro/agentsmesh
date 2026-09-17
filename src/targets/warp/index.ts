/**
 * Warp target descriptor.
 *
 * Generation emits:
 *   - `AGENTS.md`             — root rule + embedded additional rules
 *   - `.warp/skills/`         — skill bundles
 *   - `.warp/.mcp.json`       — MCP servers (standard format, project scope)
 *   - `.warpindexingignore`   — indexing exclusions (project scope)
 *   - `~/.agents/AGENTS.md`   — machine-wide rules (global scope)
 *   - `~/.warp/settings.toml` — agent permissions (global scope, merged)
 *
 * Import reads `WARP.md` (legacy, higher priority), `AGENTS.md`,
 * `.warp/skills/`, `.warp/.mcp.json` and `.warpindexingignore`; globally
 * `~/.agents/AGENTS.md`, `~/.warp/.mcp.json` and `~/.warp/settings.toml`.
 */

import { AB_IGNORE, AB_RULES } from '../../core/canonical-paths.js';
import type { TargetCapabilities, TargetGenerators } from '../catalog/target.interface.js';
import type { TargetDescriptor } from '../catalog/target-descriptor.js';
import {
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateMcp,
  generatePermissions,
  generateHooks,
  generateIgnore,
} from './generator.js';
import { project, globalLayout } from './layout.js';
import { importFromWarp } from './importer.js';
import { mergeWarpMcpJson } from './merge.js';
import { lintRules } from './linter.js';
import { lintHooks, lintPermissions, lintIgnore } from './lint.js';
import { warpScopeExtras } from './scope-extras.js';
import { buildWarpImportPaths } from '../../core/reference/import-map-builders.js';
import {
  WARP_TARGET,
  WARP_ROOT_FILE,
  WARP_LEGACY_ROOT_FILE,
  WARP_MCP_FILE,
  WARP_IGNORE_FILE,
  WARP_GLOBAL_ROOT_FILE,
  WARP_GLOBAL_SKILLS_DIR,
  WARP_GLOBAL_MCP_FILE,
} from './constants.js';

export const target: TargetGenerators = {
  name: WARP_TARGET,
  primaryRootInstructionPath: WARP_ROOT_FILE,
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateMcp,
  generatePermissions,
  generateHooks,
  generateIgnore,
  importFrom: importFromWarp,
};

const capabilities: TargetCapabilities = {
  rules: 'native',
  additionalRules: 'embedded',
  commands: 'embedded',
  agents: 'none',
  skills: 'native',
  mcp: 'native',
  hooks: 'partial',
  ignore: 'native',
  permissions: 'partial',
};

const globalCapabilities: TargetCapabilities = {
  rules: 'native',
  additionalRules: 'embedded',
  commands: 'embedded',
  agents: 'none',
  skills: 'native',
  mcp: 'native',
  hooks: 'partial',
  ignore: 'partial',
  permissions: 'native',
};

export const descriptor = {
  mergeGeneratedOutputContent: mergeWarpMcpJson,
  id: WARP_TARGET,
  metadata: {
    displayName: 'Warp',
    category: 'cli',
    officialUrl: 'https://www.warp.dev',
    shortDescription: 'AI-powered terminal',
  },
  generators: target,
  capabilities,
  emptyImportMessage:
    'No Warp config found (WARP.md, AGENTS.md, .warp/skills, .warp/.mcp.json, or .warpindexingignore).',
  lintRules,
  lint: {
    hooks: lintHooks,
    permissions: lintPermissions,
    ignore: lintIgnore,
  },
  supportsConversion: { commands: true, agents: true },
  project,
  globalSupport: {
    capabilities: globalCapabilities,
    detectionPaths: [WARP_GLOBAL_ROOT_FILE, WARP_GLOBAL_SKILLS_DIR, WARP_GLOBAL_MCP_FILE],
    layout: globalLayout,
    scopeExtras: warpScopeExtras,
  },
  importer: {
    rules: {
      feature: 'rules',
      mode: 'singleFile',
      source: {
        project: [WARP_LEGACY_ROOT_FILE, WARP_ROOT_FILE],
        global: [WARP_GLOBAL_ROOT_FILE],
      },
      canonicalDir: AB_RULES,
      canonicalRootFilename: '_root.md',
      markAsRoot: true,
    },
    mcp: {
      feature: 'mcp',
      mode: 'mcpJson',
      source: {
        project: [WARP_MCP_FILE],
        global: [WARP_GLOBAL_MCP_FILE],
      },
      canonicalDir: '.agentsmesh',
      canonicalFilename: 'mcp.json',
    },
    ignore: {
      feature: 'ignore',
      // Project-only: Warp documents no home-level indexing-ignore file.
      mode: 'flatFile',
      source: { project: [WARP_IGNORE_FILE] },
      canonicalDir: '.agentsmesh',
      canonicalFilename: AB_IGNORE,
    },
  },
  buildImportPaths: buildWarpImportPaths,
  detectionPaths: [WARP_ROOT_FILE, WARP_LEGACY_ROOT_FILE, WARP_MCP_FILE, WARP_IGNORE_FILE],
  conversionDefaults: { commandsToSkills: true, agentsToSkills: true },
} satisfies TargetDescriptor;
