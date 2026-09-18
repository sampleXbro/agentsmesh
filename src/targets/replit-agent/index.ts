/**
 * Replit Agent target descriptor.
 *
 * Generation emits:
 *   - `replit.md`          — root rule + embedded additional rules
 *   - `.agents/skills/`    — skill bundles, plus commands and agents projected
 *                            as skills (Replit invokes them by name from the
 *                            slash-command / "Use a skill" picker)
 *
 * Import reads `replit.md` and `.agents/skills/`.
 *
 * Replit Agent is cloud-only — there is no global (user-level) config.
 * MCP servers are configured via the Replit Integrations UI, not files.
 */

import { AB_RULES } from '../../core/canonical-paths.js';
import type { TargetCapabilities, TargetGenerators } from '../catalog/target.interface.js';
import type { TargetDescriptor, TargetLayout } from '../catalog/target-descriptor.js';
import {
  shouldConvertCommandsToSkills,
  shouldConvertAgentsToSkills,
} from '../../config/core/conversions.js';
import { commandSkillDirName } from '../codex-cli/command-skill.js';
import { projectedAgentSkillDirName } from '../projection/projected-agent-skill.js';
import {
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateMcp,
  generateHooks,
  generateIgnore,
  generatePermissions,
} from './generator.js';
import { importFromReplitAgent } from './importer.js';
import { lintRules } from './linter.js';
import { lintHooks, lintPermissions, lintIgnore, lintMcp } from './lint.js';
import { buildReplitAgentImportPaths } from '../../core/reference/import-maps/replit-agent.js';
import {
  REPLIT_AGENT_TARGET,
  REPLIT_AGENT_ROOT_FILE,
  REPLIT_AGENT_SKILLS_DIR,
} from './constants.js';

export const target: TargetGenerators = {
  name: REPLIT_AGENT_TARGET,
  primaryRootInstructionPath: REPLIT_AGENT_ROOT_FILE,
  generateRules,
  generateCommands,
  generateAgents,
  generateSkills,
  generateMcp,
  generateHooks,
  generateIgnore,
  generatePermissions,
  importFrom: importFromReplitAgent,
};

const project: TargetLayout = {
  rootInstructionPath: REPLIT_AGENT_ROOT_FILE,
  skillDir: REPLIT_AGENT_SKILLS_DIR,
  managedOutputs: {
    dirs: [REPLIT_AGENT_SKILLS_DIR],
    files: [REPLIT_AGENT_ROOT_FILE],
  },
  paths: {
    rulePath(_slug) {
      return REPLIT_AGENT_ROOT_FILE;
    },
    commandPath(name, config) {
      // Mirrors the generator dispatch: with the conversion off nothing is emitted.
      return shouldConvertCommandsToSkills(config, REPLIT_AGENT_TARGET, true)
        ? `${REPLIT_AGENT_SKILLS_DIR}/${commandSkillDirName(name)}/SKILL.md`
        : null;
    },
    agentPath(name, config) {
      return shouldConvertAgentsToSkills(config, REPLIT_AGENT_TARGET, true)
        ? `${REPLIT_AGENT_SKILLS_DIR}/${projectedAgentSkillDirName(name)}/SKILL.md`
        : null;
    },
  },
};

const capabilities: TargetCapabilities = {
  rules: 'native',
  additionalRules: 'embedded',
  // Replit skills are repo-committed folders under `/.agents/skills`, invoked by
  // name from the slash-command picker — the saved-prompt semantics of commands
  // and agents. Both project onto that one surface, so both are `embedded`.
  commands: 'embedded',
  agents: 'embedded',
  skills: 'native',
  mcp: 'partial',
  hooks: 'partial',
  ignore: 'partial',
  permissions: 'partial',
};

export const descriptor = {
  id: REPLIT_AGENT_TARGET,
  metadata: {
    displayName: 'Replit Agent',
    category: 'agent-platform',
    officialUrl: 'https://replit.com',
    shortDescription: "Replit's autonomous coding agent",
  },
  generators: target,
  capabilities,
  emptyImportMessage: 'No Replit Agent config found (replit.md or .agents/skills).',
  lintRules,
  lint: {
    hooks: lintHooks,
    permissions: lintPermissions,
    ignore: lintIgnore,
    mcp: lintMcp,
  },
  supportsConversion: { commands: true, agents: true },
  conversionDefaults: { commandsToSkills: true, agentsToSkills: true },
  project,
  sharedArtifacts: {
    '.agents/skills/': 'consumer',
  },
  importer: {
    rules: {
      feature: 'rules',
      mode: 'singleFile',
      source: {
        project: [REPLIT_AGENT_ROOT_FILE],
      },
      canonicalDir: AB_RULES,
      canonicalRootFilename: '_root.md',
      markAsRoot: true,
    },
  },
  buildImportPaths: buildReplitAgentImportPaths,
  detectionPaths: [REPLIT_AGENT_ROOT_FILE],
} satisfies TargetDescriptor;
