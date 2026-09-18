/**
 * Pi Coding Agent target descriptor.
 *
 * Generation emits:
 *   - `AGENTS.md`        -- root rule + embedded additional rules
 *   - `.pi/prompts/`     -- native prompt templates (slash commands)
 *   - `.pi/skills/`      -- skill bundles
 *
 * Import reads `AGENTS.md`, `.pi/prompts/`, and `.pi/skills/`.
 * Pi also reads `CLAUDE.md` as a fallback but we generate to `AGENTS.md`.
 */

import { AB_COMMANDS, AB_RULES } from '../../core/canonical-paths.js';
import type { TargetCapabilities, TargetGenerators } from '../catalog/target.interface.js';
import type { TargetDescriptor, TargetLayout } from '../catalog/target-descriptor.js';
import { projectedAgentSkillDirName } from '../projection/projected-agent-skill.js';
import {
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateHooks,
  generateIgnore,
  generatePermissions,
} from './generator.js';
import { mirrorSkillsToAgents } from '../catalog/skill-mirror.js';
import { importFromPiAgent } from './importer.js';
import { lintRules } from './linter.js';
import { lintHooks, lintPermissions, lintIgnore } from './lint.js';
import { mergePiSettings } from './permissions-format.js';
import { revokePiAgentPermissions } from './permissions-revoke.js';
import { buildPiAgentImportPaths } from '../../core/reference/import-maps/pi-agent.js';
import {
  PI_AGENT_TARGET,
  PI_AGENT_ROOT_FILE,
  PI_AGENT_SKILLS_DIR,
  PI_AGENT_COMMANDS_DIR,
  PI_AGENT_GLOBAL_ROOT_FILE,
  PI_AGENT_GLOBAL_SKILLS_DIR,
  PI_AGENT_GLOBAL_COMMANDS_DIR,
  PI_AGENT_SETTINGS_FILE,
  PI_AGENT_GLOBAL_SETTINGS_FILE,
} from './constants.js';

export const target: TargetGenerators = {
  name: PI_AGENT_TARGET,
  primaryRootInstructionPath: PI_AGENT_ROOT_FILE,
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateHooks,
  generateIgnore,
  generatePermissions,
  importFrom: importFromPiAgent,
};

const project: TargetLayout = {
  rootInstructionPath: PI_AGENT_ROOT_FILE,
  skillDir: PI_AGENT_SKILLS_DIR,
  managedOutputs: {
    dirs: [PI_AGENT_SKILLS_DIR, PI_AGENT_COMMANDS_DIR],
    files: [PI_AGENT_ROOT_FILE],
  },
  paths: {
    rulePath(_slug) {
      return PI_AGENT_ROOT_FILE;
    },
    commandPath(name) {
      return `${PI_AGENT_COMMANDS_DIR}/${name}.md`;
    },
    agentPath(name) {
      return `${PI_AGENT_SKILLS_DIR}/${projectedAgentSkillDirName(name)}/SKILL.md`;
    },
  },
};

const globalLayout: TargetLayout = {
  rootInstructionPath: PI_AGENT_GLOBAL_ROOT_FILE,
  skillDir: PI_AGENT_GLOBAL_SKILLS_DIR,
  managedOutputs: {
    dirs: [PI_AGENT_GLOBAL_SKILLS_DIR, PI_AGENT_GLOBAL_COMMANDS_DIR],
    files: [PI_AGENT_GLOBAL_ROOT_FILE],
  },
  rewriteGeneratedPath(path) {
    if (path === PI_AGENT_ROOT_FILE) return PI_AGENT_GLOBAL_ROOT_FILE;
    if (path === PI_AGENT_SETTINGS_FILE) return PI_AGENT_GLOBAL_SETTINGS_FILE;
    if (path.startsWith(`${PI_AGENT_COMMANDS_DIR}/`)) {
      return path.replace(`${PI_AGENT_COMMANDS_DIR}/`, `${PI_AGENT_GLOBAL_COMMANDS_DIR}/`);
    }
    if (path.startsWith(`${PI_AGENT_SKILLS_DIR}/`)) {
      return path.replace(`${PI_AGENT_SKILLS_DIR}/`, `${PI_AGENT_GLOBAL_SKILLS_DIR}/`);
    }
    return path;
  },
  mirrorGlobalPath(path, activeTargets) {
    return mirrorSkillsToAgents(path, PI_AGENT_GLOBAL_SKILLS_DIR, activeTargets);
  },
  paths: {
    rulePath(_slug) {
      return PI_AGENT_GLOBAL_ROOT_FILE;
    },
    commandPath(name) {
      return `${PI_AGENT_GLOBAL_COMMANDS_DIR}/${name}.md`;
    },
    agentPath(name) {
      return `${PI_AGENT_GLOBAL_SKILLS_DIR}/${projectedAgentSkillDirName(name)}/SKILL.md`;
    },
  },
};

const capabilities: TargetCapabilities = {
  rules: 'native',
  additionalRules: 'embedded',
  commands: 'native',
  agents: 'none',
  skills: 'native',
  mcp: 'none',
  hooks: 'partial',
  ignore: 'partial',
  // settings.json `defaultTools`; coarse but a real native surface at both scopes.
  permissions: 'native',
};

export const descriptor = {
  id: PI_AGENT_TARGET,
  metadata: {
    displayName: 'Pi Agent',
    category: 'cli',
    officialUrl: 'https://github.com/earendil-works/pi',
    shortDescription: 'Pi coding agent',
  },
  generators: target,
  capabilities,
  emptyImportMessage: 'No Pi Coding Agent config found (AGENTS.md or .pi/skills).',
  lintRules,
  lint: {
    hooks: lintHooks,
    permissions: lintPermissions,
    ignore: lintIgnore,
  },
  supportsConversion: { agents: true },
  project,
  globalSupport: {
    capabilities,
    detectionPaths: [PI_AGENT_GLOBAL_ROOT_FILE],
    layout: globalLayout,
    // Runs at both scopes; clears a stale defaultTools when canonical
    // permissions are gone, which the canonical-only feature loop cannot see.
    scopeExtras: revokePiAgentPermissions,
  },
  importer: {
    rules: {
      feature: 'rules',
      mode: 'singleFile',
      source: {
        project: [PI_AGENT_ROOT_FILE],
        global: [PI_AGENT_GLOBAL_ROOT_FILE],
      },
      canonicalDir: AB_RULES,
      canonicalRootFilename: '_root.md',
      markAsRoot: true,
    },
    commands: {
      feature: 'commands',
      mode: 'directory',
      source: {
        project: [PI_AGENT_COMMANDS_DIR],
        global: [PI_AGENT_GLOBAL_COMMANDS_DIR],
      },
      canonicalDir: AB_COMMANDS,
      extensions: ['.md'],
      preset: 'command',
    },
  },
  mergeGeneratedOutputContent(existing, pending, newContent, resolvedPath) {
    if (resolvedPath !== PI_AGENT_SETTINGS_FILE && resolvedPath !== PI_AGENT_GLOBAL_SETTINGS_FILE) {
      return null;
    }
    // settings.json is the user's own file (~48 unrelated keys), so only
    // `defaultTools` is rewritten. Build on the pending write from this run
    // when there is one so a later pass keeps the earlier keys.
    return mergePiSettings(pending?.content ?? existing, newContent);
  },
  sharedArtifacts: {
    '.agents/skills/': 'consumer',
  },
  buildImportPaths: buildPiAgentImportPaths,
  detectionPaths: [PI_AGENT_ROOT_FILE, PI_AGENT_SKILLS_DIR],
} satisfies TargetDescriptor;
