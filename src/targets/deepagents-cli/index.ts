/**
 * Deep Agents CLI target descriptor.
 *
 * Generation emits:
 *   - `.deepagents/AGENTS.md`   — root rule + embedded additional rules
 *   - `.deepagents/skills/`     — skill bundles (+ commands projected as skills)
 *   - `.deepagents/agents/`     — native subagent files (dedicated AGENTS.md
 *     per subagent)
 *   - `.mcp.json`               — MCP servers (standard format)
 *
 * Import reads `.deepagents/AGENTS.md`, `.deepagents/skills/`,
 * `.deepagents/agents/`, and `.mcp.json`.
 *
 * Deep Agents CLI uses `.deepagents/AGENTS.md` (not root `AGENTS.md`) to
 * avoid collision with Amp, Codex CLI, and Warp which share root `AGENTS.md`.
 *
 * Global mode generates to `~/.deepagents/{agent}/` (AGENTS.md, skills/,
 * agents/ — per-agent-instance, default agent name `"agent"`), plus the flat,
 * unscoped `~/.deepagents/.mcp.json`, `~/.deepagents/hooks.json` and
 * `~/.deepagents/config.toml`. There is no project-level hooks or permissions
 * surface at all (see `global-hooks.ts` and `global-permissions.ts`).
 */

import { AB_AGENTS, AB_RULES } from '../../core/canonical-paths.js';
import type { TargetCapabilities, TargetGenerators } from '../catalog/target.interface.js';
import type { TargetDescriptor } from '../catalog/target-descriptor.js';
import {
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateMcp,
  generateIgnore,
  generatePermissions,
} from './generator.js';
import { deepagentsCliAgentMapper } from './agent-format.js';
import { mergeDeepagentsMcpJson } from './mcp-merge.js';
import { deepagentsCliScopeExtras } from './scope-extras.js';
import { mergeDeepagentsHooksJson } from './hooks-merge.js';
import { importFromDeepagentsCli } from './importer.js';
import { lintRules } from './linter.js';
import { lintPermissions, lintIgnore, lintHooks } from './lint.js';
import { project, globalLayout } from './layout.js';
import { buildDeepagentsCliImportPaths } from '../../core/reference/import-map-builders.js';
import {
  DEEPAGENTS_CLI_TARGET,
  DEEPAGENTS_CLI_ROOT_FILE,
  DEEPAGENTS_CLI_AGENTS_DIR,
  DEEPAGENTS_CLI_MCP_FILE,
  DEEPAGENTS_CLI_GLOBAL_ROOT_FILE,
  DEEPAGENTS_CLI_GLOBAL_AGENTS_DIR,
  DEEPAGENTS_CLI_GLOBAL_MCP_FILE,
} from './constants.js';

export const target: TargetGenerators = {
  name: DEEPAGENTS_CLI_TARGET,
  primaryRootInstructionPath: DEEPAGENTS_CLI_ROOT_FILE,
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateMcp,
  generateIgnore,
  generatePermissions,
  importFrom: importFromDeepagentsCli,
};

const capabilities: TargetCapabilities = {
  rules: 'native',
  additionalRules: 'embedded',
  // No dedicated command file format (docs.langchain.com/oss/javascript/
  // deepagents/code/configuration): commands are projected as skills, the
  // same embedding `skills` already uses natively.
  commands: 'embedded',
  // `.deepagents/agents/{name}/AGENTS.md` — a dedicated on-disk subagent
  // surface, distinct from skills (see `agent-format.ts`).
  agents: 'native',
  skills: 'native',
  mcp: 'native',
  // No project-level hooks surface exists at all (only global
  // ~/.deepagents/hooks.json — see global-hooks.ts). 'none' means no support
  // path exists; lintHooks warns when canonical hooks can't be projected.
  hooks: 'none',
  ignore: 'partial',
  // `_paths.py` exposes no project-tier config.toml, so the only permission
  // surface is the global one (see globalCapabilities + global-permissions.ts).
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
  ignore: 'partial',
  // `shell.allow_list` + `startup.mode` inside the general user config file
  // `~/.deepagents/config.toml` — no dedicated permissions file, no deny/ask
  // rules (see `permissions-format.ts`).
  permissions: 'embedded',
};

export const descriptor = {
  id: DEEPAGENTS_CLI_TARGET,
  metadata: {
    displayName: 'Deep Agents CLI',
    category: 'cli',
    officialUrl: 'https://github.com/langchain-ai/deepagents',
    shortDescription: 'LangChain Deep Agents framework CLI',
  },
  generators: target,
  capabilities,
  mergeGeneratedOutputContent: (existing, pending, newContent, resolvedPath) =>
    mergeDeepagentsMcpJson(existing, pending, newContent, resolvedPath) ??
    mergeDeepagentsHooksJson(existing, pending, newContent, resolvedPath),
  emptyImportMessage:
    'No Deep Agents CLI config found (.deepagents/AGENTS.md, .deepagents/skills, or .mcp.json).',
  lintRules,
  lint: {
    permissions: lintPermissions,
    ignore: lintIgnore,
    hooks: lintHooks,
  },
  // Only commands lack a native surface and fall back to skill projection;
  // agents have their own dedicated `.deepagents/agents/` surface.
  supportsConversion: { commands: true },
  project,
  globalSupport: {
    capabilities: globalCapabilities,
    detectionPaths: [DEEPAGENTS_CLI_GLOBAL_ROOT_FILE, DEEPAGENTS_CLI_GLOBAL_MCP_FILE],
    layout: globalLayout,
    scopeExtras: deepagentsCliScopeExtras,
  },
  importer: {
    rules: {
      feature: 'rules',
      mode: 'singleFile',
      source: {
        project: [DEEPAGENTS_CLI_ROOT_FILE],
        global: [DEEPAGENTS_CLI_GLOBAL_ROOT_FILE],
      },
      canonicalDir: AB_RULES,
      canonicalRootFilename: '_root.md',
      markAsRoot: true,
    },
    agents: {
      feature: 'agents',
      mode: 'directory',
      source: {
        project: [DEEPAGENTS_CLI_AGENTS_DIR],
        global: [DEEPAGENTS_CLI_GLOBAL_AGENTS_DIR],
      },
      canonicalDir: AB_AGENTS,
      extensions: ['.md'],
      map: deepagentsCliAgentMapper,
    },
    mcp: {
      feature: 'mcp',
      mode: 'mcpJson',
      source: {
        project: [DEEPAGENTS_CLI_MCP_FILE],
        global: [DEEPAGENTS_CLI_GLOBAL_MCP_FILE],
      },
      canonicalDir: '.agentsmesh',
      canonicalFilename: 'mcp.json',
    },
  },
  buildImportPaths: buildDeepagentsCliImportPaths,
  // `.mcp.json` is co-owned with claude-code (agentsmesh writes it), so it must not enroll this target.
  detectionPaths: [DEEPAGENTS_CLI_ROOT_FILE],
} satisfies TargetDescriptor;
