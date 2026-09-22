/**
 * Generate Kilo Code target outputs from canonical files.
 *
 * Always emits the NEW kilo layout (`.kilo/...` + `AGENTS.md`). Legacy paths
 * (`.kilocode/...`) are read by the importer for migration but are never
 * generated.
 */

import type { FeatureGeneratorOutput } from '../catalog/target.interface.js';
import { basename } from 'node:path';
import type { CanonicalFiles } from '../../core/types.js';
import { generateEmbeddedSkills } from '../import/embedded-skill.js';
import { serializeFrontmatter } from '../../utils/text/markdown.js';
import {
  KILO_CODE_TARGET,
  KILO_CODE_ROOT_RULE,
  KILO_CODE_RULES_DIR,
  KILO_CODE_COMMANDS_DIR,
  KILO_CODE_AGENTS_DIR,
  KILO_CODE_SKILLS_DIR,
  KILO_CODE_MCP_FILE,
  KILO_CODE_IGNORE,
  KILO_CONFIG_FILE,
} from './constants.js';
import { ignoreOutput } from '../catalog/ignore-output.js';

export type KiloCodeOutput = FeatureGeneratorOutput;

export function generateRules(canonical: CanonicalFiles): KiloCodeOutput[] {
  const outputs: KiloCodeOutput[] = [];
  const root = canonical.rules.find((rule) => rule.root);

  if (root) {
    outputs.push({
      path: KILO_CODE_ROOT_RULE,
      content: root.body.trim() ? root.body : '',
    });
  }

  for (const rule of canonical.rules) {
    if (rule.root) continue;
    if (rule.targets.length > 0 && !rule.targets.includes(KILO_CODE_TARGET)) continue;
    const slug = basename(rule.source, '.md');
    const frontmatter: Record<string, unknown> = {};
    if (rule.description) frontmatter.description = rule.description;
    if (rule.globs.length > 0) frontmatter.globs = rule.globs;
    const content =
      Object.keys(frontmatter).length > 0
        ? serializeFrontmatter(frontmatter, rule.body.trim() || '')
        : rule.body.trim() || '';
    outputs.push({
      path: `${KILO_CODE_RULES_DIR}/${slug}.md`,
      content,
    });
  }

  return outputs;
}

export function generateCommands(canonical: CanonicalFiles): KiloCodeOutput[] {
  return canonical.commands.map((command) => {
    const frontmatter: Record<string, unknown> = {};
    if (command.description) frontmatter.description = command.description;
    return {
      path: `${KILO_CODE_COMMANDS_DIR}/${command.name}.md`,
      content: serializeFrontmatter(frontmatter, command.body.trim() || ''),
    };
  });
}

/**
 * Generate `.kilo/agents/<slug>.md` from canonical agents.
 *
 * Kilo's new subagent format (per https://kilo.ai/docs/customize/custom-subagents)
 * is Markdown with YAML frontmatter. `mode: subagent` is the documented default
 * for user-defined subagents.
 */
export function generateAgents(canonical: CanonicalFiles): KiloCodeOutput[] {
  return canonical.agents.map((agent) => {
    const slug = basename(agent.source, '.md');
    const frontmatter: Record<string, unknown> = { mode: 'subagent' };
    if (agent.description) frontmatter.description = agent.description;
    if (agent.model) frontmatter.model = agent.model;
    if (agent.tools.length > 0) frontmatter.tools = agent.tools;
    if (agent.disallowedTools.length > 0) frontmatter.disallowedTools = agent.disallowedTools;
    return {
      path: `${KILO_CODE_AGENTS_DIR}/${slug}.md`,
      content: serializeFrontmatter(frontmatter, agent.body.trim() || ''),
    };
  });
}

export function generateMcp(canonical: CanonicalFiles): KiloCodeOutput[] {
  if (!canonical.mcp || Object.keys(canonical.mcp.mcpServers).length === 0) return [];
  return [
    {
      path: KILO_CODE_MCP_FILE,
      content: JSON.stringify({ mcpServers: canonical.mcp.mcpServers }, null, 2),
    },
  ];
}

export const generateIgnore = ignoreOutput(KILO_CODE_IGNORE);

export function generatePermissions(canonical: CanonicalFiles): KiloCodeOutput[] {
  if (!canonical.permissions) return [];
  const { allow, deny } = canonical.permissions;
  const ask = canonical.permissions.ask ?? [];
  if (allow.length === 0 && deny.length === 0 && ask.length === 0) return [];
  const permission: Record<string, 'allow' | 'ask' | 'deny'> = {};
  for (const name of allow) permission[name] = 'allow';
  for (const name of ask) permission[name] = 'ask';
  for (const name of deny) permission[name] = 'deny';
  return [{ path: KILO_CONFIG_FILE, content: JSON.stringify({ permission }, null, 2) }];
}

export function generateSkills(canonical: CanonicalFiles): KiloCodeOutput[] {
  return generateEmbeddedSkills(canonical, KILO_CODE_SKILLS_DIR);
}
