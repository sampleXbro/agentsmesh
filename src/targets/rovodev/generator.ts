/**
 * Generate Rovo Dev target outputs from canonical files.
 *
 * Emits:
 *   - `AGENTS.md`                — root rule + embedded non-root rules
 *   - `.rovodev/skills/`         — skill bundles
 *   - `.rovodev/prompts.yml`     — saved prompts manifest (custom commands)
 *   - `.rovodev/commands/*.md`   — saved prompt content files
 *   - `~/.rovodev/mcp_config.json` — MCP servers (global scope only; no
 *     project-level MCP file is documented)
 */

import { embeddedRootRule } from '../projection/managed-blocks.js';
import type { FeatureGeneratorOutput } from '../catalog/target.interface.js';
import type { CanonicalFiles } from '../../core/types.js';
import type { GenerateFeatureContext } from '../catalog/target.interface.js';
import { generateEmbeddedSkills } from '../import/embedded-skill.js';
import {
  projectedAgentSkillDirName,
  serializeProjectedAgentSkill,
} from '../projection/projected-agent-skill.js';
import { generateCommands as generatePrompts } from './prompts.js';
import {
  ROVODEV_TARGET,
  ROVODEV_ROOT_FILE,
  ROVODEV_SKILLS_DIR,
  ROVODEV_GLOBAL_MCP_FILE,
} from './constants.js';

export type RovodevOutput = FeatureGeneratorOutput;

export const generateRules = (canonical: CanonicalFiles): RovodevOutput[] =>
  embeddedRootRule(canonical, ROVODEV_TARGET, ROVODEV_ROOT_FILE);

export function generateSkills(canonical: CanonicalFiles): RovodevOutput[] {
  return generateEmbeddedSkills(canonical, ROVODEV_SKILLS_DIR);
}

export const generateCommands = generatePrompts;

export function generateAgents(canonical: CanonicalFiles): RovodevOutput[] {
  return canonical.agents.map((agent) => ({
    path: `${ROVODEV_SKILLS_DIR}/${projectedAgentSkillDirName(agent.name)}/SKILL.md`,
    content: serializeProjectedAgentSkill(agent),
  }));
}

/**
 * MCP is documented only at global scope (`~/.rovodev/mcp_config.json`); no
 * project-level MCP file exists, so this returns `[]` outside global scope
 * rather than leaking a project-scope file the tool never reads.
 */
export function generateMcp(
  canonical: CanonicalFiles,
  ctx?: GenerateFeatureContext,
): RovodevOutput[] {
  if (ctx?.scope !== 'global') return [];
  if (!canonical.mcp || Object.keys(canonical.mcp.mcpServers).length === 0) return [];
  const content = JSON.stringify({ mcpServers: canonical.mcp.mcpServers }, null, 2);
  return [{ path: ROVODEV_GLOBAL_MCP_FILE, content }];
}
