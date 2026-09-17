/**
 * Generate Factory Droid target outputs from canonical files.
 *
 * Emits:
 *   - `AGENTS.md`            — root rule + embedded non-root rules
 *   - `.factory/skills/`     — skill bundles
 *   - `.factory/droids/`     — native droid definitions from canonical agents
 *   - `.factory/mcp.json`    — MCP server configuration
 *
 * Commands are projected as skills via `supportsConversion`.
 */

import { embeddedRootRule } from '../projection/managed-blocks.js';
import { NO_OUTPUTS } from '../catalog/no-outputs.js';
import type { FeatureGeneratorOutput } from '../catalog/target.interface.js';
import type { CanonicalFiles } from '../../core/types.js';
import { generateEmbeddedSkills } from '../import/embedded-skill.js';
import { serializeFrontmatter } from '../../utils/text/markdown.js';
import { buildWrappedCommandHooks } from '../import/wrapped-command-hooks.js';
import { serializeDroid } from './droid-serializer.js';
import {
  FACTORY_DROID_TARGET,
  FACTORY_DROID_ROOT_FILE,
  FACTORY_DROID_SKILLS_DIR,
  FACTORY_DROID_COMMANDS_DIR,
  FACTORY_DROID_DROIDS_DIR,
  FACTORY_DROID_MCP_FILE,
  FACTORY_DROID_HOOKS_FILE,
  FACTORY_DROID_SETTINGS_FILE,
} from './constants.js';

export type FactoryDroidOutput = FeatureGeneratorOutput;

export const generateRules = (canonical: CanonicalFiles): FactoryDroidOutput[] =>
  embeddedRootRule(canonical, FACTORY_DROID_TARGET, FACTORY_DROID_ROOT_FILE);

export function generateSkills(canonical: CanonicalFiles): FactoryDroidOutput[] {
  return generateEmbeddedSkills(canonical, FACTORY_DROID_SKILLS_DIR);
}

export function generateCommands(canonical: CanonicalFiles): FactoryDroidOutput[] {
  return canonical.commands.map((command) => {
    const frontmatter: Record<string, unknown> = {
      description: command.description || undefined,
      'allowed-tools': command.allowedTools.length > 0 ? command.allowedTools : undefined,
    };
    if (frontmatter.description === undefined) delete frontmatter.description;
    if (frontmatter['allowed-tools'] === undefined) delete frontmatter['allowed-tools'];
    return {
      path: `${FACTORY_DROID_COMMANDS_DIR}/${command.name}.md`,
      content: serializeFrontmatter(frontmatter, command.body.trim() || ''),
    };
  });
}

export function generateAgents(canonical: CanonicalFiles): FactoryDroidOutput[] {
  return canonical.agents.map((agent) => ({
    path: `${FACTORY_DROID_DROIDS_DIR}/${agent.name}.md`,
    content: serializeDroid(agent),
  }));
}

export function generateHooks(canonical: CanonicalFiles): FactoryDroidOutput[] {
  return buildWrappedCommandHooks(canonical, FACTORY_DROID_HOOKS_FILE);
}

export function generatePermissions(canonical: CanonicalFiles): FactoryDroidOutput[] {
  if (!canonical.permissions) return [];
  const { allow, deny } = canonical.permissions;
  if (allow.length === 0 && deny.length === 0) return [];
  const settings: Record<string, unknown> = {};
  if (allow.length > 0) settings.commandAllowlist = allow;
  if (deny.length > 0) settings.commandDenylist = deny;
  return [{ path: FACTORY_DROID_SETTINGS_FILE, content: JSON.stringify(settings, null, 2) }];
}

export function generateMcp(canonical: CanonicalFiles): FactoryDroidOutput[] {
  if (!canonical.mcp || Object.keys(canonical.mcp.mcpServers).length === 0) return [];

  return [
    {
      path: FACTORY_DROID_MCP_FILE,
      content: JSON.stringify({ mcpServers: canonical.mcp.mcpServers }, null, 2),
    },
  ];
}

export const generateIgnore = NO_OUTPUTS;
