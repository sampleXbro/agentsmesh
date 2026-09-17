/**
 * Generate Replit Agent target outputs from canonical files.
 *
 * Emits:
 *   - `replit.md`          — root rule + embedded non-root rules
 *   - `.agents/skills/`    — skill bundles
 *
 * MCP, hooks, ignore, and permissions are 'partial' (advisory lint only):
 *   - MCP: configured via Replit Integrations UI, not a project file
 *   - hooks: no lifecycle hook file surface in Replit Agent
 *   - ignore: no dedicated ignore file (relies on .gitignore)
 *   - permissions: managed in the cloud UI, not a writable file surface
 * The four no-op generator stubs below satisfy the schema contract that
 * requires a generateX function when capability level != 'none'.
 */

import { embeddedRootRule } from '../projection/managed-blocks.js';
import { NO_OUTPUTS } from '../catalog/no-outputs.js';
import type { FeatureGeneratorOutput } from '../catalog/target.interface.js';
import type { CanonicalFiles } from '../../core/types.js';
import { generateEmbeddedSkills } from '../import/embedded-skill.js';
import {
  projectedAgentSkillDirName,
  serializeProjectedAgentSkill,
} from '../projection/projected-agent-skill.js';
import { commandSkillDirName, serializeCommandSkill } from '../codex-cli/command-skill.js';
import {
  REPLIT_AGENT_TARGET,
  REPLIT_AGENT_ROOT_FILE,
  REPLIT_AGENT_SKILLS_DIR,
} from './constants.js';

export type ReplitAgentOutput = FeatureGeneratorOutput;

export const generateRules = (canonical: CanonicalFiles): ReplitAgentOutput[] =>
  embeddedRootRule(canonical, REPLIT_AGENT_TARGET, REPLIT_AGENT_ROOT_FILE);

export function generateSkills(canonical: CanonicalFiles): ReplitAgentOutput[] {
  return generateEmbeddedSkills(canonical, REPLIT_AGENT_SKILLS_DIR);
}

export function generateCommands(canonical: CanonicalFiles): ReplitAgentOutput[] {
  return canonical.commands.map((command) => ({
    path: `${REPLIT_AGENT_SKILLS_DIR}/${commandSkillDirName(command.name)}/SKILL.md`,
    content: serializeCommandSkill(command),
  }));
}

export function generateAgents(canonical: CanonicalFiles): ReplitAgentOutput[] {
  return canonical.agents.map((agent) => ({
    path: `${REPLIT_AGENT_SKILLS_DIR}/${projectedAgentSkillDirName(agent.name)}/SKILL.md`,
    content: serializeProjectedAgentSkill(agent),
  }));
}

export const generateMcp = NO_OUTPUTS;

export const generateHooks = NO_OUTPUTS;

export const generateIgnore = NO_OUTPUTS;

export const generatePermissions = NO_OUTPUTS;
