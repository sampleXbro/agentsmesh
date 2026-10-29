/**
 * Goose target descriptor.
 *
 * Generation emits:
 *   - `.goosehints`       — root rule + embedded additional rules
 *   - `.agents/skills/`   — skill bundles
 *   - `.gooseignore`      — ignore patterns
 *   - `.agents/plugins/agentsmesh/.mcp.json` — stdio MCP servers (project scope)
 *
 * Import reads `.goosehints`, `.agents/skills/`, `.gooseignore`, and the plugin
 * `.mcp.json`.
 * Goose also reads `AGENTS.md` but we generate to the native `.goosehints`
 * path to avoid shared-artifact collisions with other targets.
 */

import type { TargetGenerators } from '../catalog/target.interface.js';
import type { TargetDescriptor, TargetLayout } from '../catalog/target-descriptor.js';
import { projectCapabilities, globalCapabilities } from './capabilities.js';
import { commandSkillDirName } from '../codex-cli/command-skill.js';
import { projectedAgentSkillDirName } from '../projection/projected-agent-skill.js';
import {
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateIgnore,
  generateHooks,
  generatePermissions,
} from './generator.js';
import { emitGooseProjectMcp, mergeGooseMcpContent } from './mcp-settings.js';
import { mirrorSkillsToAgents } from '../catalog/skill-mirror.js';
import { importFromGoose } from './importer.js';
import { gooseImporter } from './importer-spec.js';
import { generateGooseScopeExtras } from './scope-extras.js';
import { lintRules } from './linter.js';
import { lintPermissions, lintMcp, lintIgnore } from './lint.js';
import { buildGooseImportPaths } from '../../core/reference/import-map-builders.js';
import {
  GOOSE_TARGET,
  GOOSE_ROOT_FILE,
  GOOSE_SKILLS_DIR,
  GOOSE_IGNORE,
  GOOSE_HOOKS_FILE,
  GOOSE_PROJECT_MCP_FILE,
  GOOSE_GLOBAL_ROOT_FILE,
  GOOSE_GLOBAL_IGNORE,
  GOOSE_GLOBAL_CONFIG,
  GOOSE_GLOBAL_SKILLS_DIR,
  GOOSE_GLOBAL_PERMISSIONS,
} from './constants.js';

export const target: TargetGenerators = {
  name: GOOSE_TARGET,
  primaryRootInstructionPath: GOOSE_ROOT_FILE,
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateIgnore,
  // No `generateMcp`: both MCP files merge into content agentsmesh does not own.
  // Project scope goes through `emitScopedSettings`, global through `scopeExtras`.
  generateHooks,
  generatePermissions,
  importFrom: importFromGoose,
};

const project: TargetLayout = {
  rootInstructionPath: GOOSE_ROOT_FILE,
  skillDir: GOOSE_SKILLS_DIR,
  managedOutputs: {
    dirs: [GOOSE_SKILLS_DIR],
    // The plugin `.mcp.json` is listed so revoking every stdio server deletes it.
    // Consequence, and intended: a run with `mcp` disabled also removes it, the
    // same way `.goosehints` and the sibling `hooks/hooks.json` are removed. All
    // three are agentsmesh's own artifacts inside the `agentsmesh` plugin dir.
    // The user-owned `~/.config/goose/config.yaml` is deliberately NOT managed.
    files: [GOOSE_ROOT_FILE, GOOSE_HOOKS_FILE, GOOSE_PROJECT_MCP_FILE],
  },
  paths: {
    rulePath(_slug) {
      return GOOSE_ROOT_FILE;
    },
    commandPath(name) {
      return `${GOOSE_SKILLS_DIR}/${commandSkillDirName(name)}/SKILL.md`;
    },
    agentPath(name) {
      return `${GOOSE_SKILLS_DIR}/${projectedAgentSkillDirName(name)}/SKILL.md`;
    },
  },
};

const globalLayout: TargetLayout = {
  rootInstructionPath: GOOSE_GLOBAL_ROOT_FILE,
  skillDir: GOOSE_GLOBAL_SKILLS_DIR,
  managedOutputs: {
    dirs: [GOOSE_GLOBAL_SKILLS_DIR],
    // `config.yaml` is NOT listed: it is goose's primary config (provider, model,
    // GOOSE_MODE, builtin extensions) and stale-cleanup deletes every managed
    // file a run did not emit, so a global run without `mcp` would erase it.
    // Revocation is handled inside `global-mcp.ts` by clearing `extensions`.
    files: [GOOSE_GLOBAL_ROOT_FILE, GOOSE_HOOKS_FILE],
    // `permission.yaml` carries goose's own tool-permission state; agentsmesh
    // merges canonical permissions into the `user` category only
    // (`scope-extras.ts`), so deleting it discards the categories goose owns.
    coOwnedFiles: [GOOSE_GLOBAL_PERMISSIONS],
  },
  rewriteGeneratedPath(path) {
    if (path === GOOSE_ROOT_FILE) return GOOSE_GLOBAL_ROOT_FILE;
    if (path === GOOSE_IGNORE) return GOOSE_GLOBAL_IGNORE;
    // Skills: `GOOSE_SKILLS_DIR === GOOSE_GLOBAL_SKILLS_DIR === '.agents/skills'`
    // by design — goose mirrors agents/skills under one path in both scopes.
    // No rewrite needed.
    return path;
  },
  mirrorGlobalPath(path, activeTargets) {
    return mirrorSkillsToAgents(path, GOOSE_GLOBAL_SKILLS_DIR, activeTargets);
  },
  paths: {
    rulePath(_slug) {
      return GOOSE_GLOBAL_ROOT_FILE;
    },
    commandPath(name) {
      return `${GOOSE_GLOBAL_SKILLS_DIR}/${commandSkillDirName(name)}/SKILL.md`;
    },
    agentPath(name) {
      return `${GOOSE_GLOBAL_SKILLS_DIR}/${projectedAgentSkillDirName(name)}/SKILL.md`;
    },
  },
};

export const descriptor = {
  id: GOOSE_TARGET,
  metadata: {
    displayName: 'Goose',
    category: 'cli',
    officialUrl: 'https://block.github.io/goose',
    shortDescription: "Block's open-source AI agent",
  },
  generators: target,
  capabilities: projectCapabilities,
  emptyImportMessage:
    `No Goose config found (.goosehints, .agents/skills, .gooseignore, or ` +
    `${GOOSE_PROJECT_MCP_FILE}).`,
  lintRules,
  lint: {
    permissions: lintPermissions,
    mcp: lintMcp,
    ignore: lintIgnore,
  },
  emitScopedSettings: emitGooseProjectMcp,
  mergeGeneratedOutputContent: mergeGooseMcpContent,
  supportsConversion: { commands: true, agents: true },
  project,
  globalSupport: {
    capabilities: globalCapabilities,
    detectionPaths: [
      GOOSE_GLOBAL_ROOT_FILE,
      GOOSE_GLOBAL_SKILLS_DIR,
      GOOSE_GLOBAL_CONFIG,
    ],
    layout: globalLayout,
    scopeExtras: generateGooseScopeExtras,
  },
  importer: gooseImporter,
  sharedArtifacts: {
    '.agents/skills/': 'consumer',
  },
  buildImportPaths: buildGooseImportPaths,
  detectionPaths: [GOOSE_ROOT_FILE, GOOSE_PROJECT_MCP_FILE],
  conversionDefaults: { commandsToSkills: true, agentsToSkills: true },
} satisfies TargetDescriptor;
