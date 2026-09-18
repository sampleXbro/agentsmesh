/**
 * Generate OpenCode target outputs from canonical files.
 *
 * Emits:
 *   - `AGENTS.md`                    — root rule
 *   - `.opencode/rules/<slug>.md`    — additional rules (with optional frontmatter)
 *   - `.opencode/commands/<name>.md` — slash commands (with optional frontmatter)
 *   - `.opencode/agents/<slug>.md`   — custom agents (with YAML frontmatter)
 *   - `.opencode/skills/`            — skill bundles
 *   - `opencode.json`               — MCP servers under `mcp` key, plus
 *     `instructions` (additional rules glob) and `permission` (permissions
 *     and ignore path deny rules)
 */

import type { FeatureGeneratorOutput } from '../catalog/target.interface.js';
import { basename } from 'node:path';
import type { CanonicalFiles, CanonicalRule } from '../../core/types.js';
import type { McpServer } from '../../core/mcp-types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { generateEmbeddedSkills } from '../import/embedded-skill.js';
import { serializeFrontmatter } from '../../utils/text/markdown.js';
import { mapAgentToolsToOpenCodePermission } from './permission-map.js';
import { mapIgnoreToOpenCodePermission } from './ignore-map.js';
import {
  OPENCODE_TARGET,
  OPENCODE_ROOT_RULE,
  OPENCODE_RULES_DIR,
  OPENCODE_COMMANDS_DIR,
  OPENCODE_AGENTS_DIR,
  OPENCODE_SKILLS_DIR,
  OPENCODE_CONFIG_FILE,
  OPENCODE_RULES_INSTRUCTIONS_GLOB,
  OPENCODE_GLOBAL_RULES_INSTRUCTIONS_GLOB,
} from './constants.js';

export type OpenCodeOutput = FeatureGeneratorOutput;

function isAdditionalRule(rule: CanonicalRule): boolean {
  if (rule.root) return false;
  return rule.targets.length === 0 || rule.targets.includes(OPENCODE_TARGET);
}

export function generateRules(canonical: CanonicalFiles): OpenCodeOutput[] {
  const outputs: OpenCodeOutput[] = [];
  const root = canonical.rules.find((rule) => rule.root);

  if (root) {
    outputs.push({
      path: OPENCODE_ROOT_RULE,
      content: root.body.trim() ? root.body : '',
    });
  }

  for (const rule of canonical.rules.filter(isAdditionalRule)) {
    const slug = basename(rule.source, '.md');
    const frontmatter: Record<string, unknown> = {};
    if (rule.description) frontmatter.description = rule.description;
    if (rule.globs.length > 0) frontmatter.globs = rule.globs;
    const content =
      Object.keys(frontmatter).length > 0
        ? serializeFrontmatter(frontmatter, rule.body.trim() || '')
        : rule.body.trim() || '';
    outputs.push({
      path: `${OPENCODE_RULES_DIR}/${slug}.md`,
      content,
    });
  }

  return outputs;
}

/**
 * Generate the `instructions` array entry in `opencode.json` that makes
 * `.opencode/rules/*.md` actually load — OpenCode does not auto-scan that
 * directory (opencode.ai/docs/rules); only files listed in `instructions`
 * are read, alongside `AGENTS.md`.
 */
export function generateInstructions(
  canonical: CanonicalFiles,
  scope: TargetLayoutScope,
): OpenCodeOutput[] {
  if (!canonical.rules.some(isAdditionalRule)) return [];
  const glob =
    scope === 'global' ? OPENCODE_GLOBAL_RULES_INSTRUCTIONS_GLOB : OPENCODE_RULES_INSTRUCTIONS_GLOB;
  return [
    {
      path: OPENCODE_CONFIG_FILE,
      content: JSON.stringify({ instructions: [glob] }, null, 2),
    },
  ];
}

export function generateCommands(canonical: CanonicalFiles): OpenCodeOutput[] {
  return canonical.commands.map((command) => {
    const frontmatter: Record<string, unknown> = {};
    if (command.description) frontmatter.description = command.description;
    return {
      path: `${OPENCODE_COMMANDS_DIR}/${command.name}.md`,
      content: serializeFrontmatter(frontmatter, command.body.trim() || ''),
    };
  });
}

export function generateAgents(canonical: CanonicalFiles): OpenCodeOutput[] {
  return canonical.agents.map((agent) => {
    const slug = basename(agent.source, '.md');
    const frontmatter: Record<string, unknown> = { mode: 'subagent' };
    if (agent.description) frontmatter.description = agent.description;
    if (agent.model) frontmatter.model = agent.model;
    // `tools` is deprecated (boolean-map shape, not a string array) and
    // `disallowedTools` does not exist in OpenCode's schema at all — use the
    // real `permission` object instead. See opencode.ai/docs/agents.
    const permission = mapAgentToolsToOpenCodePermission(agent);
    if (Object.keys(permission).length > 0) frontmatter.permission = permission;
    return {
      path: `${OPENCODE_AGENTS_DIR}/${slug}.md`,
      content: serializeFrontmatter(frontmatter, agent.body.trim() || ''),
    };
  });
}

function toOpenCodeMcpServer(server: McpServer): Record<string, unknown> {
  if ('url' in server) {
    const entry: Record<string, unknown> = { type: 'remote', url: server.url };
    if (Object.keys(server.headers).length > 0) entry.headers = server.headers;
    if (server.description) entry.description = server.description;
    return entry;
  }
  const entry: Record<string, unknown> = {
    type: 'local',
    command: [server.command, ...server.args],
  };
  if (Object.keys(server.env).length > 0) entry.environment = server.env;
  if (server.description) entry.description = server.description;
  return entry;
}

export function generateMcp(canonical: CanonicalFiles): OpenCodeOutput[] {
  if (!canonical.mcp || Object.keys(canonical.mcp.mcpServers).length === 0) return [];
  const mcpEntries: Record<string, Record<string, unknown>> = {};
  for (const [name, server] of Object.entries(canonical.mcp.mcpServers)) {
    mcpEntries[name] = toOpenCodeMcpServer(server);
  }
  return [
    {
      path: OPENCODE_CONFIG_FILE,
      content: JSON.stringify({ mcp: mcpEntries }, null, 2),
    },
  ];
}

export function generatePermissions(canonical: CanonicalFiles): OpenCodeOutput[] {
  if (!canonical.permissions) return [];
  const permission: Record<string, 'allow' | 'ask' | 'deny'> = {};
  for (const name of canonical.permissions.allow) permission[name] = 'allow';
  for (const name of canonical.permissions.ask ?? []) permission[name] = 'ask';
  for (const name of canonical.permissions.deny) permission[name] = 'deny';
  if (Object.keys(permission).length === 0) return [];
  return [{ path: OPENCODE_CONFIG_FILE, content: JSON.stringify({ permission }, null, 2) }];
}

/**
 * Canonical ignore becomes `permission.read`/`permission.edit` path deny rules
 * — the only OpenCode surface that actually blocks access to a file. See
 * `ignore-map.ts` for why `watcher.ignore` is not used.
 */
export function generateIgnore(canonical: CanonicalFiles): OpenCodeOutput[] {
  const permission = mapIgnoreToOpenCodePermission(canonical.ignore);
  if (Object.keys(permission).length === 0) return [];
  return [{ path: OPENCODE_CONFIG_FILE, content: JSON.stringify({ permission }, null, 2) }];
}

export function generateSkills(canonical: CanonicalFiles): OpenCodeOutput[] {
  return generateEmbeddedSkills(canonical, OPENCODE_SKILLS_DIR);
}
