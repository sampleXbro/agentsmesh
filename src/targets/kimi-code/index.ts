/**
 * Kimi Code CLI target descriptor.
 *
 * Generation emits:
 *   - `AGENTS.md`               — root rule + embedded additional rules
 *   - `.kimi-code/agents/`      — native agent definitions
 *   - `.kimi-code/skills/`      — skills, plus commands projected as skills
 *   - `.kimi-code/mcp.json`     — MCP servers (`mcpServers`)
 *   - `~/.kimi-code/AGENTS.md`  — the same instruction file, global scope
 *   - `~/.kimi-code/config.toml`— hooks + permission rules (global scope, merged)
 *
 * `AGENTS.md` is shared with Codex CLI, Warp and friends: this target is a
 * CONSUMER there and reuses the shared embedded-rules serializer so every
 * writer produces byte-identical content. `~/.agents/AGENTS.md`,
 * `~/.agents/skills/` and `.mcp.json` are read by Kimi Code but owned by other
 * targets, so agentsmesh never writes them from here.
 */

import { AB_AGENTS } from '../../core/canonical-paths.js';
import type { TargetCapabilities, TargetGenerators } from '../catalog/target.interface.js';
import type { TargetDescriptor } from '../catalog/target-descriptor.js';
import {
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateMcp,
  generateHooks,
  generatePermissions,
} from './generator.js';
import { projectLayout, globalLayout } from './layout.js';
import { importFromKimiCode } from './importer.js';
import { mergeKimiCodeMcpJson } from './merge.js';
import { lintRules } from './linter.js';
import { lintAgents, lintHooks, lintMcp, lintPermissions } from './lint.js';
import { kimiCodeScopeExtras } from './scope-extras.js';
import { buildKimiCodeImportPaths } from '../../core/reference/import-map-builders.js';
import {
  KIMI_CODE_TARGET,
  KIMI_CODE_ROOT_FILE,
  KIMI_CODE_NESTED_ROOT_FILE,
  KIMI_CODE_AGENTS_DIR,
  KIMI_CODE_SKILLS_DIR,
  KIMI_CODE_MCP_FILE,
  KIMI_CODE_GLOBAL_ROOT_FILE,
  KIMI_CODE_GLOBAL_AGENTS_DIR,
  KIMI_CODE_GLOBAL_SKILLS_DIR,
  KIMI_CODE_GLOBAL_MCP_FILE,
  KIMI_CODE_GLOBAL_CONFIG_FILE,
} from './constants.js';

export const target: TargetGenerators = {
  name: KIMI_CODE_TARGET,
  primaryRootInstructionPath: KIMI_CODE_ROOT_FILE,
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateMcp,
  generateHooks,
  generatePermissions,
  importFrom: importFromKimiCode,
  lint: lintAgents,
};

/**
 * Hooks and permissions are `partial` here: Kimi Code has both, but only in the
 * user-level `config.toml`, so nothing lands for a project (lint says so).
 * Ignore is `none`: the CLI documents no indexing-ignore file.
 */
const capabilities: TargetCapabilities = {
  rules: 'native',
  additionalRules: 'embedded',
  commands: 'embedded',
  agents: 'native',
  skills: 'native',
  mcp: 'native',
  hooks: 'partial',
  ignore: 'none',
  permissions: 'partial',
};

const globalCapabilities: TargetCapabilities = {
  rules: 'native',
  additionalRules: 'embedded',
  commands: 'embedded',
  agents: 'native',
  skills: 'native',
  mcp: 'native',
  hooks: 'native',
  ignore: 'none',
  permissions: 'native',
};

export const descriptor = {
  mergeGeneratedOutputContent: mergeKimiCodeMcpJson,
  id: KIMI_CODE_TARGET,
  metadata: {
    displayName: 'Kimi Code CLI',
    category: 'cli',
    officialUrl: 'https://moonshotai.github.io/kimi-code/en/',
    shortDescription: 'Moonshot AI terminal coding agent',
  },
  generators: target,
  capabilities,
  emptyImportMessage:
    'No Kimi Code config found (AGENTS.md, .kimi-code/AGENTS.md, .kimi-code/agents, .kimi-code/skills, or .kimi-code/mcp.json).',
  lintRules,
  lint: {
    hooks: lintHooks,
    mcp: lintMcp,
    permissions: lintPermissions,
  },
  supportsConversion: { commands: true },
  project: projectLayout,
  globalSupport: {
    capabilities: globalCapabilities,
    // `.agents/AGENTS.md` and `.agents/skills` are deliberately absent: they are
    // shared with Warp and Codex CLI, so detecting on them would claim Kimi Code
    // in any home directory that uses those tools.
    detectionPaths: [
      KIMI_CODE_GLOBAL_ROOT_FILE,
      KIMI_CODE_GLOBAL_AGENTS_DIR,
      KIMI_CODE_GLOBAL_SKILLS_DIR,
      KIMI_CODE_GLOBAL_MCP_FILE,
      KIMI_CODE_GLOBAL_CONFIG_FILE,
    ],
    layout: globalLayout,
    scopeExtras: kimiCodeScopeExtras,
  },
  // No `importer.rules` spec: the `singleFile` runner would copy the embedded
  // rules block verbatim into `_root.md`; `rules-import.ts` splits it first.
  // No `importer.mcp` spec either: the shared `mcpJson` mode reads the canonical
  // `type`, and Kimi Code's key is `transport` (see `mcp-import.ts`).
  importer: {
    agents: {
      feature: 'agents',
      mode: 'directory',
      source: { project: [KIMI_CODE_AGENTS_DIR], global: [KIMI_CODE_GLOBAL_AGENTS_DIR] },
      canonicalDir: AB_AGENTS,
      extensions: ['.md'],
      preset: 'agent',
    },
  },
  buildImportPaths: buildKimiCodeImportPaths,
  sharedArtifacts: {
    'AGENTS.md': 'consumer',
  },
  detectionPaths: [
    KIMI_CODE_ROOT_FILE,
    KIMI_CODE_NESTED_ROOT_FILE,
    KIMI_CODE_AGENTS_DIR,
    KIMI_CODE_SKILLS_DIR,
    KIMI_CODE_MCP_FILE,
  ],
  nativeInstall: {
    pickPaths: [
      {
        prefix: KIMI_CODE_AGENTS_DIR,
        feature: 'agents',
        strategy: { kind: 'basename', suffix: '.md' },
      },
      { prefix: KIMI_CODE_SKILLS_DIR, feature: 'skills', strategy: { kind: 'skillDir' } },
    ],
  },
  conversionDefaults: { commandsToSkills: true },
} satisfies TargetDescriptor;
