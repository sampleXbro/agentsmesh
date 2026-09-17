/**
 * Generate Pi Coding Agent target outputs from canonical files.
 *
 * Emits:
 *   - `AGENTS.md`        -- root rule + embedded non-root rules
 *   - `.pi/prompts/`     -- native prompt templates (slash commands)
 *   - `.pi/skills/`      -- skill bundles
 *
 * Pi uses `AGENTS.md` at project root for instructions, `.pi/prompts/` for
 * prompt templates, and `.pi/skills/` for skill bundles following the Agent
 * Skills standard (SKILL.md).
 */

import { embeddedRootRule } from '../projection/managed-blocks.js';
import { NO_OUTPUTS } from '../catalog/no-outputs.js';
import type { FeatureGeneratorOutput } from '../catalog/target.interface.js';
import type { CanonicalFiles } from '../../core/types.js';
import { generateEmbeddedSkills } from '../import/embedded-skill.js';
import { serializeFrontmatter } from '../../utils/text/markdown.js';
import {
  projectedAgentSkillDirName,
  serializeProjectedAgentSkill,
} from '../projection/projected-agent-skill.js';
import { buildDefaultTools, hasPermissionEntries } from './permissions-format.js';
import {
  PI_AGENT_TARGET,
  PI_AGENT_ROOT_FILE,
  PI_AGENT_SKILLS_DIR,
  PI_AGENT_COMMANDS_DIR,
  PI_AGENT_SETTINGS_FILE,
} from './constants.js';

export type PiAgentOutput = FeatureGeneratorOutput;

export const generateRules = (canonical: CanonicalFiles): PiAgentOutput[] =>
  embeddedRootRule(canonical, PI_AGENT_TARGET, PI_AGENT_ROOT_FILE);

export function generateSkills(canonical: CanonicalFiles): PiAgentOutput[] {
  return generateEmbeddedSkills(canonical, PI_AGENT_SKILLS_DIR);
}

export function generateCommands(canonical: CanonicalFiles): PiAgentOutput[] {
  return canonical.commands.map((command) => {
    // Pi prompt templates support only `description` (+ `argument-hint`) in
    // frontmatter; canonical allowedTools have no equivalent and are dropped.
    const frontmatter: Record<string, unknown> = {};
    if (command.description) frontmatter.description = command.description;
    return {
      path: `${PI_AGENT_COMMANDS_DIR}/${command.name}.md`,
      content: serializeFrontmatter(frontmatter, command.body.trim() || ''),
    };
  });
}

export function generateAgents(canonical: CanonicalFiles): PiAgentOutput[] {
  return canonical.agents.map((agent) => ({
    path: `${PI_AGENT_SKILLS_DIR}/${projectedAgentSkillDirName(agent.name)}/SKILL.md`,
    content: serializeProjectedAgentSkill(agent),
  }));
}

export const generateHooks = NO_OUTPUTS;

export const generateIgnore = NO_OUTPUTS;

/**
 * Project `.pi/settings.json` `defaultTools` (the global layout rewrites the
 * path to `.pi/agent/settings.json`). Only that one key is written; the merge
 * in `mergeGeneratedOutputContent` folds it into the ~48 keys settings.json
 * already holds. Note a project array REPLACES the global one rather than
 * extending it, so the project file must be a complete allow-list on its own.
 *
 * The key is written even when the projection is empty. `defaultTools: []` says
 * "canonical pre-approves no Pi built-in", which is what a permissions file of
 * command patterns and path globs really projects to; omitting the key instead
 * would re-enable every built-in the user had switched off. `lintPermissions`
 * names each one. Revoking canonical entirely is handled by `scopeExtras`,
 * which can see the file on disk (see `permissions-revoke.ts`).
 */
export function generatePermissions(canonical: CanonicalFiles): PiAgentOutput[] {
  if (!hasPermissionEntries(canonical.permissions)) return [];
  const defaultTools = buildDefaultTools(canonical.permissions);
  return [{ path: PI_AGENT_SETTINGS_FILE, content: JSON.stringify({ defaultTools }, null, 2) }];
}
