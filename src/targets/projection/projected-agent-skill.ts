import { toToolsArray as toStringArray } from '../import/shared-import-helpers.js';
import type { CanonicalAgent, Hooks } from '../../core/types.js';
import { serializeFrontmatter } from '../../utils/text/markdown.js';

export const PROJECTED_AGENT_SKILL_PREFIX = 'am-agent-';
export const LEGACY_PROJECTED_AGENT_SKILL_PREFIX = 'ab-agent-';

interface ParsedProjectedAgent {
  name: string;
  description: string;
  tools: string[];
  disallowedTools: string[];
  model: string;
  permissionMode: string;
  maxTurns: number;
  mcpServers: string[];
  hooks: Hooks;
  skills: string[];
  memory: string;
}

function toHooks(value: unknown): Hooks {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const hooks: Hooks = {};
  for (const [event, entries] of Object.entries(value)) {
    if (!Array.isArray(entries)) continue;
    hooks[event] = entries.filter(
      (entry): entry is NonNullable<Hooks[string]>[number] =>
        entry !== null &&
        typeof entry === 'object' &&
        typeof (entry as Record<string, unknown>).matcher === 'string' &&
        typeof (entry as Record<string, unknown>).command === 'string',
    );
  }
  return hooks;
}

export function projectedAgentSkillDirName(name: string): string {
  return `${PROJECTED_AGENT_SKILL_PREFIX}${name}`;
}

export function serializeProjectedAgentSkill(agent: CanonicalAgent): string {
  const frontmatter: Record<string, unknown> = {
    name: projectedAgentSkillDirName(agent.name),
    description: agent.description || undefined,
    'x-agentsmesh-kind': 'agent',
    'x-agentsmesh-name': agent.name,
    'x-agentsmesh-tools': agent.tools.length > 0 ? agent.tools : undefined,
    'x-agentsmesh-disallowed-tools':
      agent.disallowedTools.length > 0 ? agent.disallowedTools : undefined,
    'x-agentsmesh-model': agent.model || undefined,
    'x-agentsmesh-permission-mode': agent.permissionMode || undefined,
    'x-agentsmesh-max-turns': agent.maxTurns > 0 ? agent.maxTurns : undefined,
    'x-agentsmesh-mcp-servers': agent.mcpServers.length > 0 ? agent.mcpServers : undefined,
    'x-agentsmesh-hooks': Object.keys(agent.hooks).length > 0 ? agent.hooks : undefined,
    'x-agentsmesh-skills': agent.skills.length > 0 ? agent.skills : undefined,
    'x-agentsmesh-memory': agent.memory || undefined,
  };
  Object.keys(frontmatter).forEach((key) => {
    if (frontmatter[key] === undefined) delete frontmatter[key];
  });
  return serializeFrontmatter(frontmatter, agent.body.trim() || '');
}

export function parseProjectedAgentSkillFrontmatter(
  frontmatter: Record<string, unknown>,
  dirName: string,
): ParsedProjectedAgent | null {
  if (frontmatter['x-agentsmesh-kind'] !== 'agent') return null;

  const metadataName =
    typeof frontmatter['x-agentsmesh-name'] === 'string' ? frontmatter['x-agentsmesh-name'] : '';
  const derivedName = dirName.startsWith(PROJECTED_AGENT_SKILL_PREFIX)
    ? dirName.slice(PROJECTED_AGENT_SKILL_PREFIX.length)
    : dirName.startsWith(LEGACY_PROJECTED_AGENT_SKILL_PREFIX)
      ? dirName.slice(LEGACY_PROJECTED_AGENT_SKILL_PREFIX.length)
      : '';
  const name = (metadataName || derivedName).trim();
  if (!name) return null;

  return {
    name,
    description: typeof frontmatter.description === 'string' ? frontmatter.description : '',
    tools: toStringArray(frontmatter['x-agentsmesh-tools']),
    disallowedTools: toStringArray(frontmatter['x-agentsmesh-disallowed-tools']),
    model:
      typeof frontmatter['x-agentsmesh-model'] === 'string'
        ? frontmatter['x-agentsmesh-model']
        : '',
    permissionMode:
      typeof frontmatter['x-agentsmesh-permission-mode'] === 'string'
        ? frontmatter['x-agentsmesh-permission-mode']
        : '',
    maxTurns:
      typeof frontmatter['x-agentsmesh-max-turns'] === 'number'
        ? frontmatter['x-agentsmesh-max-turns']
        : Number(frontmatter['x-agentsmesh-max-turns'] ?? 0),
    mcpServers: toStringArray(frontmatter['x-agentsmesh-mcp-servers']),
    hooks: toHooks(frontmatter['x-agentsmesh-hooks']),
    skills: toStringArray(frontmatter['x-agentsmesh-skills']),
    memory:
      typeof frontmatter['x-agentsmesh-memory'] === 'string'
        ? frontmatter['x-agentsmesh-memory']
        : '',
  };
}

export function serializeImportedAgent(agent: ParsedProjectedAgent, body: string): string {
  const frontmatter: Record<string, unknown> = {
    name: agent.name,
    description: agent.description,
    tools: agent.tools,
    disallowedTools: agent.disallowedTools.length > 0 ? agent.disallowedTools : undefined,
    model: agent.model || undefined,
    permissionMode: agent.permissionMode || undefined,
    maxTurns: agent.maxTurns > 0 ? agent.maxTurns : undefined,
    mcpServers: agent.mcpServers.length > 0 ? agent.mcpServers : undefined,
    hooks: Object.keys(agent.hooks).length > 0 ? agent.hooks : undefined,
    skills: agent.skills.length > 0 ? agent.skills : undefined,
    memory: agent.memory || undefined,
  };
  Object.keys(frontmatter).forEach((key) => {
    if (frontmatter[key] === undefined) delete frontmatter[key];
  });
  return serializeFrontmatter(frontmatter, body.trim() || '');
}
