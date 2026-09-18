/**
 * Generate Crush target outputs from canonical files.
 *
 * Emits:
 *   - `CRUSH.md`         — root rule + embedded non-root rules
 *   - `.crush/skills/`   — skill bundles
 *   - `crush.json`       — MCP servers, hooks, permissions merged into config
 *   - `.crushignore`     — ignore patterns
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
import {
  CRUSH_TARGET,
  CRUSH_ROOT_FILE,
  CRUSH_SKILLS_DIR,
  CRUSH_CONFIG_FILE,
  CRUSH_IGNORE,
} from './constants.js';
import { buildCrushConfigJson } from './config-format.js';

export type CrushOutput = FeatureGeneratorOutput;

export const generateRules = (canonical: CanonicalFiles): CrushOutput[] =>
  embeddedRootRule(canonical, CRUSH_TARGET, CRUSH_ROOT_FILE);

export function generateSkills(canonical: CanonicalFiles): CrushOutput[] {
  return generateEmbeddedSkills(canonical, CRUSH_SKILLS_DIR);
}

export function generateCommands(canonical: CanonicalFiles): CrushOutput[] {
  return canonical.commands.map((command) => ({
    path: `${CRUSH_SKILLS_DIR}/${commandSkillDirName(command.name)}/SKILL.md`,
    content: serializeCommandSkill(command),
  }));
}

export function generateAgents(canonical: CanonicalFiles): CrushOutput[] {
  return canonical.agents.map((agent) => ({
    path: `${CRUSH_SKILLS_DIR}/${projectedAgentSkillDirName(agent.name)}/SKILL.md`,
    content: serializeProjectedAgentSkill(agent),
  }));
}

/**
 * Generate crush.json from canonical MCP servers.
 * Crush uses `mcp` key (not `mcpServers`) for MCP configuration.
 */
export function generateMcp(canonical: CanonicalFiles): CrushOutput[] {
  if (!canonical.mcp || Object.keys(canonical.mcp.mcpServers).length === 0) return [];
  const crushConfig = buildCrushConfigJson({ mcp: canonical.mcp.mcpServers });
  return [{ path: CRUSH_CONFIG_FILE, content: JSON.stringify(crushConfig, null, 2) }];
}

/**
 * Generate crush.json hooks from canonical hooks.
 * Crush uses `hooks.PreToolUse[{matcher, command, timeout?}]` format.
 */
export function generateHooks(canonical: CanonicalFiles): CrushOutput[] {
  if (!canonical.hooks) return [];
  const hooks = buildCrushHooksFromCanonical(canonical);
  if (Object.keys(hooks).length === 0) return [];
  const crushConfig = buildCrushConfigJson({ hooks });
  return [{ path: CRUSH_CONFIG_FILE, content: JSON.stringify(crushConfig, null, 2) }];
}

/**
 * Generate crush.json permissions from canonical permissions.
 * Crush uses `permissions.allowed_tools` array.
 */
export function generatePermissions(canonical: CanonicalFiles): CrushOutput[] {
  if (!canonical.permissions) return [];
  const { allow, deny } = canonical.permissions;
  const ask = canonical.permissions.ask ?? [];
  if (allow.length === 0 && deny.length === 0 && ask.length === 0) return [];
  const permissions: Record<string, unknown> = {};
  if (allow.length > 0) permissions['allowed_tools'] = allow;
  const options: Record<string, unknown> = {};
  if (deny.length > 0) options['disabled_tools'] = deny;
  const crushConfig = buildCrushConfigJson({
    ...(Object.keys(permissions).length > 0 ? { permissions } : {}),
    ...(Object.keys(options).length > 0 ? { options } : {}),
  });
  return [{ path: CRUSH_CONFIG_FILE, content: JSON.stringify(crushConfig, null, 2) }];
}

/**
 * Generate .crushignore from canonical ignore patterns.
 */
export function generateIgnore(canonical: CanonicalFiles): CrushOutput[] {
  if (!canonical.ignore || canonical.ignore.length === 0) return [];
  const content = canonical.ignore.join('\n');
  return [{ path: CRUSH_IGNORE, content }];
}

function buildCrushHooksFromCanonical(canonical: CanonicalFiles): Record<string, unknown> {
  if (!canonical.hooks) return {};
  const result: Record<string, unknown[]> = {};
  for (const [event, entries] of Object.entries(canonical.hooks)) {
    if (!Array.isArray(entries)) continue;
    const items: Array<Record<string, unknown>> = [];
    for (const e of entries) {
      const command = typeof e.command === 'string' ? e.command.trim() : '';
      if (!command) continue;
      const item: Record<string, unknown> = { matcher: e.matcher, command };
      if (e.timeout !== undefined) item['timeout'] = e.timeout;
      items.push(item);
    }
    if (items.length > 0) result[event] = items;
  }
  return result;
}
