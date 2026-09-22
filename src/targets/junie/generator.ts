import { basename } from 'node:path';
import type { CanonicalFiles, McpServer } from '../../core/types.js';
import { isStdioMcpServer } from '../../core/mcp-servers.js';
import { generateEmbeddedSkills } from '../import/embedded-skill.js';
import { appendEmbeddedRulesBlock } from '../projection/managed-blocks.js';
import { serializeFrontmatter } from '../../utils/text/markdown.js';
import {
  JUNIE_AGENTS_DIR,
  JUNIE_COMMANDS_DIR,
  JUNIE_DOT_AGENTS,
  JUNIE_RULES_DIR,
  JUNIE_IGNORE,
  JUNIE_MCP_FILE,
  JUNIE_SKILLS_DIR,
} from './constants.js';
import { ignoreOutput } from '../catalog/ignore-output.js';

export type { JunieOutput } from './global-config.js';
export { generatePermissions, emitJunieScopedSettings, mergeJunieConfig } from './global-config.js';

export function generateRules(canonical: CanonicalFiles): Array<{ path: string; content: string }> {
  const outputs: Array<{ path: string; content: string }> = [];
  const root = canonical.rules.find((rule) => rule.root);

  if (root) {
    outputs.push({
      path: JUNIE_DOT_AGENTS,
      content: root.body.trim() || '',
    });
  }

  for (const rule of canonical.rules) {
    if (rule.root) continue;
    if (rule.targets.length > 0 && !rule.targets.includes('junie')) continue;
    const slug = basename(rule.source, '.md');
    outputs.push({
      path: `${JUNIE_RULES_DIR}/${slug}.md`,
      content: rule.body.trim() || '',
    });
  }

  return outputs;
}

function toJunieMcpServer(server: McpServer): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (server.description) out.description = server.description;
  // Omit type when it is 'stdio' — Junie's implied default
  if (server.type !== 'stdio') out.type = server.type;
  if (isStdioMcpServer(server)) {
    out.command = server.command;
    out.args = server.args;
  } else {
    out.url = server.url;
    if (Object.keys(server.headers).length > 0) out.headers = server.headers;
  }
  // Omit env when empty — Junie omits it by default
  if (Object.keys(server.env).length > 0) out.env = server.env;
  return out;
}

export function generateMcp(canonical: CanonicalFiles): Array<{ path: string; content: string }> {
  if (!canonical.mcp || Object.keys(canonical.mcp.mcpServers).length === 0) return [];
  const servers = Object.fromEntries(
    Object.entries(canonical.mcp.mcpServers).map(([name, srv]) => [name, toJunieMcpServer(srv)]),
  );
  return [{ path: JUNIE_MCP_FILE, content: JSON.stringify({ mcpServers: servers }, null, 2) }];
}

export function generateCommands(
  canonical: CanonicalFiles,
): Array<{ path: string; content: string }> {
  return canonical.commands.map((command) => {
    const frontmatter: Record<string, unknown> = {
      description: command.description || undefined,
    };
    if (frontmatter.description === undefined) delete frontmatter.description;
    return {
      path: `${JUNIE_COMMANDS_DIR}/${command.name}.md`,
      content: serializeFrontmatter(frontmatter, command.body.trim() || ''),
    };
  });
}

export function generateAgents(
  canonical: CanonicalFiles,
): Array<{ path: string; content: string }> {
  return canonical.agents.map((agent) => {
    const frontmatter: Record<string, unknown> = {
      name: agent.name,
      description: agent.description || undefined,
      tools: agent.tools.length > 0 ? agent.tools : undefined,
      disallowedTools: agent.disallowedTools.length > 0 ? agent.disallowedTools : undefined,
      model: agent.model || undefined,
      skills: agent.skills.length > 0 ? agent.skills : undefined,
    };
    Object.keys(frontmatter).forEach((key) => {
      if (frontmatter[key] === undefined) delete frontmatter[key];
    });
    return {
      path: `${JUNIE_AGENTS_DIR}/${agent.name}.md`,
      content: serializeFrontmatter(frontmatter, agent.body.trim() || ''),
    };
  });
}

export const generateIgnore = ignoreOutput(JUNIE_IGNORE);

export function generateSkills(
  canonical: CanonicalFiles,
): Array<{ path: string; content: string }> {
  return generateEmbeddedSkills(canonical, JUNIE_SKILLS_DIR);
}

export function renderJunieGlobalInstructions(canonical: CanonicalFiles): string {
  const root = canonical.rules.find((rule) => rule.root);
  const nonRootRules = canonical.rules.filter((rule) => {
    if (rule.root) return false;
    return rule.targets.length === 0 || rule.targets.includes('junie');
  });

  return appendEmbeddedRulesBlock(root?.body.trim() ?? '', nonRootRules);
}
