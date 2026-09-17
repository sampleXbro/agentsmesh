/**
 * Amp (Sourcegraph) target descriptor.
 *
 * Generation emits:
 *   - `AGENTS.md`          — root rule + embedded additional rules
 *   - `.agents/skills/`    — skill bundles
 *   - `.amp/settings.json` — MCP servers (via emitScopedSettings)
 *
 * Import reads `AGENTS.md`, `.agents/skills/`, and `.amp/settings.json`.
 * Amp also reads `AGENT.md` and `CLAUDE.md` as fallbacks but we generate
 * to the canonical `AGENTS.md` path.
 */

import { AB_RULES } from '../../core/canonical-paths.js';
import type { TargetCapabilities, TargetGenerators } from '../catalog/target.interface.js';
import type { TargetDescriptor, TargetLayout } from '../catalog/target-descriptor.js';
import { commandSkillDirName } from '../codex-cli/command-skill.js';
import { projectedAgentSkillDirName } from '../projection/projected-agent-skill.js';
import {
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  buildAmpScopedSettings,
} from './generator.js';
import { mirrorSkillsToAgents } from '../catalog/skill-mirror.js';
import { importFromAmp } from './importer.js';
import { lintRules } from './linter.js';
import { lintIgnore, lintPermissions, lintHooks } from './lint.js';
import { buildAmpImportPaths } from '../../core/reference/import-map-builders.js';
import {
  AMP_TARGET,
  AMP_ROOT_FILE,
  AMP_SKILLS_DIR,
  AMP_MCP_FILE,
  AMP_GLOBAL_ROOT_FILE,
  AMP_GLOBAL_SKILLS_DIR,
  AMP_GLOBAL_MCP_FILE,
} from './constants.js';

export const target: TargetGenerators = {
  name: AMP_TARGET,
  primaryRootInstructionPath: AMP_ROOT_FILE,
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  importFrom: importFromAmp,
};

const project: TargetLayout = {
  rootInstructionPath: AMP_ROOT_FILE,
  skillDir: AMP_SKILLS_DIR,
  managedOutputs: {
    dirs: [AMP_SKILLS_DIR],
    files: [AMP_ROOT_FILE],
    // Amp's own settings file: agentsmesh owns `amp.mcpServers` and nothing else
    // (the legacy `amp.permissions` key next to it is the user's).
    coOwnedFiles: [AMP_MCP_FILE],
  },
  paths: {
    rulePath(_slug) {
      return AMP_ROOT_FILE;
    },
    commandPath(name) {
      return `${AMP_SKILLS_DIR}/${commandSkillDirName(name)}/SKILL.md`;
    },
    agentPath(name) {
      return `${AMP_SKILLS_DIR}/${projectedAgentSkillDirName(name)}/SKILL.md`;
    },
  },
};

const globalLayout: TargetLayout = {
  rootInstructionPath: AMP_GLOBAL_ROOT_FILE,
  skillDir: AMP_GLOBAL_SKILLS_DIR,
  managedOutputs: {
    dirs: [AMP_GLOBAL_SKILLS_DIR],
    files: [AMP_GLOBAL_ROOT_FILE],
    coOwnedFiles: [AMP_GLOBAL_MCP_FILE],
  },
  rewriteGeneratedPath(path) {
    if (path === AMP_ROOT_FILE) return AMP_GLOBAL_ROOT_FILE;
    if (path === AMP_MCP_FILE) return AMP_GLOBAL_MCP_FILE;
    if (path.startsWith(`${AMP_SKILLS_DIR}/`)) {
      return path.replace(`${AMP_SKILLS_DIR}/`, `${AMP_GLOBAL_SKILLS_DIR}/`);
    }
    return path;
  },
  mirrorGlobalPath(path, activeTargets) {
    return mirrorSkillsToAgents(path, AMP_GLOBAL_SKILLS_DIR, activeTargets);
  },
  paths: {
    rulePath(_slug) {
      return AMP_GLOBAL_ROOT_FILE;
    },
    commandPath(name) {
      return `${AMP_GLOBAL_SKILLS_DIR}/${commandSkillDirName(name)}/SKILL.md`;
    },
    agentPath(name) {
      return `${AMP_GLOBAL_SKILLS_DIR}/${projectedAgentSkillDirName(name)}/SKILL.md`;
    },
  },
};

const capabilities: TargetCapabilities = {
  rules: 'native',
  additionalRules: 'embedded',
  // Amp has no declarative slash-command file format (ampcode.com/manual):
  // commands only exist via `amp.registerCommand(...)` inside a TypeScript
  // plugin. AgentsMesh projects commands as skills, so 'embedded' (routed
  // through the already-native skills surface) is the honest ceiling.
  commands: 'embedded',
  agents: 'embedded',
  skills: 'native',
  mcp: 'native',
  hooks: 'partial',
  ignore: 'partial',
  // amp.permissions is a LEGACY key (ampcode.com/manual) with an array-of-rule-objects
  // schema that is incompatible with the canonical {allow,deny,ask} format.
  // agentsmesh cannot emit a valid amp.permissions value; 'partial' is the ceiling.
  permissions: 'partial',
};

function mergeAmpSettings(existing: string | null, newContent: string): string {
  if (existing === null) return newContent;
  let base: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(existing);
    base =
      parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
  } catch {
    base = {};
  }
  const incoming: unknown = JSON.parse(newContent);
  if (incoming === null || typeof incoming !== 'object' || Array.isArray(incoming)) return existing;
  const overlay = incoming as Record<string, unknown>;
  if (overlay['amp.mcpServers'] !== undefined) base['amp.mcpServers'] = overlay['amp.mcpServers'];
  return JSON.stringify(base, null, 2);
}

export const descriptor = {
  id: AMP_TARGET,
  metadata: {
    displayName: 'Amp',
    category: 'cli',
    officialUrl: 'https://ampcode.com',
    shortDescription: "Sourcegraph's coding agent",
  },
  generators: target,
  capabilities,
  emptyImportMessage: 'No Amp config found (AGENTS.md, .agents/skills, or .amp/settings.json).',
  lintRules,
  lint: {
    ignore: lintIgnore,
    permissions: lintPermissions,
    hooks: lintHooks,
  },
  supportsConversion: { commands: true, agents: true },
  project,
  globalSupport: {
    capabilities,
    detectionPaths: [AMP_GLOBAL_ROOT_FILE, AMP_GLOBAL_MCP_FILE],
    layout: globalLayout,
  },
  importer: {
    rules: {
      feature: 'rules',
      mode: 'singleFile',
      source: {
        project: [AMP_ROOT_FILE],
        global: [AMP_GLOBAL_ROOT_FILE],
      },
      canonicalDir: AB_RULES,
      canonicalRootFilename: '_root.md',
      markAsRoot: true,
    },
  },
  emitScopedSettings(canonical, _scope, enabledFeatures) {
    return buildAmpScopedSettings(canonical, enabledFeatures);
  },
  mergeGeneratedOutputContent(existing, pending, newContent, resolvedPath) {
    if (resolvedPath === AMP_MCP_FILE || resolvedPath === AMP_GLOBAL_MCP_FILE) {
      return mergeAmpSettings(pending?.content ?? existing, newContent);
    }
    return null;
  },
  sharedArtifacts: {
    '.agents/skills/': 'consumer',
  },
  buildImportPaths: buildAmpImportPaths,
  detectionPaths: [AMP_ROOT_FILE, AMP_MCP_FILE],
  conversionDefaults: { commandsToSkills: true, agentsToSkills: true },
} satisfies TargetDescriptor;
