/**
 * Generate Goose target outputs from canonical files.
 *
 * Emits:
 *   - `.goosehints`                  — root rule + embedded non-root rules
 *   - `.agents/skills/`              — skill bundles
 *   - `.gooseignore`                 — ignore patterns
 *   - `.agents/plugins/agentsmesh/hooks/hooks.json` — lifecycle hooks
 *
 * MCP is NOT here: both of its files are merged into content agentsmesh does not
 * own. See `mcp-format.ts` (project plugin `.mcp.json`) and `global-mcp.ts`
 * (`config.yaml`).
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
import { buildWrappedCommandHooks } from '../import/wrapped-command-hooks.js';
import {
  GOOSE_TARGET,
  GOOSE_ROOT_FILE,
  GOOSE_SKILLS_DIR,
  GOOSE_IGNORE,
  GOOSE_HOOKS_FILE,
} from './constants.js';
import { ignoreOutput } from '../catalog/ignore-output.js';

export type GooseOutput = FeatureGeneratorOutput;

export const generateRules = (canonical: CanonicalFiles): GooseOutput[] =>
  embeddedRootRule(canonical, GOOSE_TARGET, GOOSE_ROOT_FILE);

export function generateSkills(canonical: CanonicalFiles): GooseOutput[] {
  return generateEmbeddedSkills(canonical, GOOSE_SKILLS_DIR);
}

export function generateCommands(canonical: CanonicalFiles): GooseOutput[] {
  return canonical.commands.map((command) => ({
    path: `${GOOSE_SKILLS_DIR}/${commandSkillDirName(command.name)}/SKILL.md`,
    content: serializeCommandSkill(command),
  }));
}

export function generateAgents(canonical: CanonicalFiles): GooseOutput[] {
  return canonical.agents.map((agent) => ({
    path: `${GOOSE_SKILLS_DIR}/${projectedAgentSkillDirName(agent.name)}/SKILL.md`,
    content: serializeProjectedAgentSkill(agent),
  }));
}

export const generateIgnore = ignoreOutput(GOOSE_IGNORE);

export function generateHooks(canonical: CanonicalFiles): GooseOutput[] {
  return buildWrappedCommandHooks(canonical, GOOSE_HOOKS_FILE);
}

export const generatePermissions = NO_OUTPUTS;
