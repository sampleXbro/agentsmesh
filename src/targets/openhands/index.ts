/**
 * OpenHands target descriptor.
 *
 * Generation emits `AGENTS.md` (rewritten to `~/.agents/skills/_root.md` in
 * global scope), path-scoped rules and skill bundles under `.agents/skills/`,
 * subagents under `.agents/agents/`, `/agentsmesh:<name>` commands and MCP
 * servers under `.agents/plugins/agentsmesh/`, and lifecycle hooks in
 * `.openhands/hooks.json`. Import reads the same set back.
 *
 * OpenHands also loads `CLAUDE.md`, `GEMINI.md` and `.cursorrules` — but
 * SIMULTANEOUSLY, as separate always-on skills that duplicate context rather
 * than override each other, so only `AGENTS.md` is written.
 */

import { AB_AGENTS, AB_COMMANDS, AB_RULES } from '../../core/canonical-paths.js';
import type { TargetGenerators } from '../catalog/target.interface.js';
import type { TargetDescriptor } from '../catalog/target-descriptor.js';
import { projectCapabilities, globalCapabilities } from './capabilities.js';
import {
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateHooks,
  generatePermissions,
} from './generator.js';
import { projectLayout, globalLayout } from './layout.js';
import { emitOpenhandsMcp } from './mcp-settings.js';
import { mergeOpenhandsOutput } from './merge.js';
import { mapOpenhandsFlatRule } from './import-rules.js';
import { importFromOpenhands } from './importer.js';
import { lintRules } from './linter.js';
import { lintAgents, lintHooks, lintMcp, lintPermissions } from './lint.js';
import { buildOpenhandsImportPaths } from '../../core/reference/import-map-builders.js';
import {
  OPENHANDS_TARGET,
  OPENHANDS_DIR,
  OPENHANDS_ROOT_FILE,
  OPENHANDS_SKILLS_DIR,
  OPENHANDS_AGENTS_DIR,
  OPENHANDS_COMMANDS_DIR,
  OPENHANDS_MCP_FILE,
  OPENHANDS_HOOKS_FILE,
  OPENHANDS_GLOBAL_ROOT_FILE,
  OPENHANDS_CANONICAL_MCP,
} from './constants.js';

export const target: TargetGenerators = {
  name: OPENHANDS_TARGET,
  primaryRootInstructionPath: OPENHANDS_ROOT_FILE,
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  // No `generateMcp`: the shared plugin `.mcp.json` is merged, not rewritten
  // (see mcp-settings.ts).
  generateHooks,
  generatePermissions,
  importFrom: importFromOpenhands,
  // Ungated by feature, so agent-only feature sets still get the warning.
  lint: lintAgents,
};

export const descriptor = {
  id: OPENHANDS_TARGET,
  metadata: {
    displayName: 'OpenHands',
    category: 'cli',
    officialUrl: 'https://docs.openhands.dev',
    shortDescription: 'Open-source autonomous coding agent (self-hosted)',
  },
  generators: target,
  capabilities: projectCapabilities,
  emptyImportMessage:
    `No OpenHands config found (AGENTS.md, ${OPENHANDS_SKILLS_DIR}, ${OPENHANDS_AGENTS_DIR}, ` +
    `${OPENHANDS_COMMANDS_DIR}, or ${OPENHANDS_HOOKS_FILE}).`,
  lintRules,
  lint: {
    hooks: lintHooks,
    mcp: lintMcp,
    permissions: lintPermissions,
  },
  emitScopedSettings: emitOpenhandsMcp,
  mergeGeneratedOutputContent: mergeOpenhandsOutput,
  project: projectLayout,
  globalSupport: {
    capabilities: globalCapabilities,
    // `.agents/…` is deliberately absent: it is shared with codex-cli, goose and
    // antigravity, so detecting on it would claim OpenHands in any repo they touch.
    detectionPaths: [OPENHANDS_DIR, OPENHANDS_HOOKS_FILE],
    layout: globalLayout,
  },
  importer: {
    rules: [
      {
        feature: 'rules',
        mode: 'singleFile',
        source: { project: [OPENHANDS_ROOT_FILE], global: [OPENHANDS_GLOBAL_ROOT_FILE] },
        canonicalDir: AB_RULES,
        canonicalRootFilename: '_root.md',
        markAsRoot: true,
      },
      {
        // Flat `<slug>.md` files only; nested skill bundles and `_root.md` are
        // filtered inside the mapper (see import-rules.ts).
        feature: 'rules',
        mode: 'directory',
        source: { project: [OPENHANDS_SKILLS_DIR], global: [OPENHANDS_SKILLS_DIR] },
        canonicalDir: AB_RULES,
        extensions: ['.md'],
        map: mapOpenhandsFlatRule,
      },
    ],
    commands: {
      feature: 'commands',
      mode: 'directory',
      source: { project: [OPENHANDS_COMMANDS_DIR], global: [OPENHANDS_COMMANDS_DIR] },
      canonicalDir: AB_COMMANDS,
      extensions: ['.md'],
      preset: 'command',
    },
    agents: {
      feature: 'agents',
      mode: 'directory',
      source: { project: [OPENHANDS_AGENTS_DIR], global: [OPENHANDS_AGENTS_DIR] },
      canonicalDir: AB_AGENTS,
      extensions: ['.md'],
      preset: 'agent',
    },
    mcp: {
      feature: 'mcp',
      mode: 'mcpJson',
      source: { project: [OPENHANDS_MCP_FILE], global: [OPENHANDS_MCP_FILE] },
      canonicalDir: '.agentsmesh',
      canonicalFilename: OPENHANDS_CANONICAL_MCP,
    },
  },
  buildImportPaths: buildOpenhandsImportPaths,
  sharedArtifacts: {
    '.agents/skills/': 'consumer',
    '.agents/agents/': 'consumer',
    '.agents/plugins/': 'consumer',
  },
  detectionPaths: [OPENHANDS_DIR, OPENHANDS_HOOKS_FILE, OPENHANDS_COMMANDS_DIR],
} satisfies TargetDescriptor;
