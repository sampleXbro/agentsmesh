/**
 * Generate Amp target outputs from canonical files.
 *
 * Emits:
 *   - `AGENTS.md`          — root rule + embedded non-root rules
 *   - `.agents/skills/`    — skill bundles
 *
 * MCP is emitted via `emitScopedSettings` (not generateMcp) because
 * Amp stores MCP servers inside `.amp/settings.json` alongside other
 * workspace settings, requiring a JSON-merge strategy.
 */

import { embeddedRootRule } from '../projection/managed-blocks.js';
import type { FeatureGeneratorOutput } from '../catalog/target.interface.js';
import type { CanonicalFiles } from '../../core/types.js';
import { generateEmbeddedSkills } from '../import/embedded-skill.js';
import {
  projectedAgentSkillDirName,
  serializeProjectedAgentSkill,
} from '../projection/projected-agent-skill.js';
import { commandSkillDirName, serializeCommandSkill } from '../codex-cli/command-skill.js';
import { AMP_TARGET, AMP_ROOT_FILE, AMP_SKILLS_DIR, AMP_MCP_FILE } from './constants.js';

export type AmpOutput = FeatureGeneratorOutput;

export const generateRules = (canonical: CanonicalFiles): AmpOutput[] =>
  embeddedRootRule(canonical, AMP_TARGET, AMP_ROOT_FILE);

export function generateSkills(canonical: CanonicalFiles): AmpOutput[] {
  return generateEmbeddedSkills(canonical, AMP_SKILLS_DIR);
}

/**
 * Commands have no declarative file format in Amp (ampcode.com/manual): they
 * only exist via `amp.registerCommand(...)` inside a TypeScript plugin. So
 * this projects each command as a skill — the same embedding `generateSkills`
 * already uses natively — rather than a dedicated command surface.
 */
export function generateCommands(canonical: CanonicalFiles): AmpOutput[] {
  return canonical.commands.map((command) => ({
    path: `${AMP_SKILLS_DIR}/${commandSkillDirName(command.name)}/SKILL.md`,
    content: serializeCommandSkill(command),
  }));
}

export function generateAgents(canonical: CanonicalFiles): AmpOutput[] {
  return canonical.agents.map((agent) => ({
    path: `${AMP_SKILLS_DIR}/${projectedAgentSkillDirName(agent.name)}/SKILL.md`,
    content: serializeProjectedAgentSkill(agent),
  }));
}

/**
 * MCP is the only settings sidecar Amp actually reads that agentsmesh can emit.
 *
 * Amp has NO documented `amp.hooks` settings-file key (ampcode.com/manual never
 * mentions hooks) — only the plugin-based `amp.on(...)` event API, which is code,
 * not a file agentsmesh can emit. hooks capability is 'partial'.
 *
 * `amp.permissions` is a LEGACY key (ampcode.com/manual/appendix/legacy-permissions-rules.txt)
 * with an array-of-rule-objects schema that is incompatible with the canonical
 * {allow,deny,ask} string-array format. agentsmesh cannot emit a valid
 * amp.permissions value; permissions capability is 'partial'. Use lintPermissions
 * to surface this to users.
 */
export function buildAmpScopedSettings(
  canonical: CanonicalFiles,
  enabledFeatures: ReadonlySet<string>,
): AmpOutput[] {
  const outputs: AmpOutput[] = [];
  if (
    enabledFeatures.has('mcp') &&
    canonical.mcp &&
    Object.keys(canonical.mcp.mcpServers).length > 0
  ) {
    outputs.push({
      path: AMP_MCP_FILE,
      content: JSON.stringify({ 'amp.mcpServers': canonical.mcp.mcpServers }, null, 2),
    });
  }
  return outputs;
}
