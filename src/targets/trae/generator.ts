import type { FeatureGeneratorOutput } from '../catalog/target.interface.js';
import { basename } from 'node:path';
import type { CanonicalFiles } from '../../core/types.js';
import { generateEmbeddedSkills } from '../import/embedded-skill.js';
import { serializeFrontmatter } from '../../utils/text/markdown.js';
import { hasHookCommand } from '../../core/hook-command.js';
import {
  TRAE_TARGET,
  TRAE_PROJECT_RULES,
  TRAE_RULES_DIR,
  TRAE_AGENTS_DIR,
  TRAE_COMMANDS_DIR,
  TRAE_SKILLS_DIR,
  TRAE_MCP_FILE,
  TRAE_IGNORE,
  TRAE_HOOKS_FILE,
} from './constants.js';

export type TraeOutput = FeatureGeneratorOutput;

export function generateRules(canonical: CanonicalFiles): TraeOutput[] {
  const outputs: TraeOutput[] = [];

  const root = canonical.rules.find((rule) => rule.root);
  if (root) {
    outputs.push({ path: TRAE_PROJECT_RULES, content: root.body.trim() });
  }

  for (const rule of canonical.rules) {
    if (rule.root) continue;
    if (rule.targets.length > 0 && !rule.targets.includes(TRAE_TARGET)) continue;
    const slug = basename(rule.source, '.md');
    outputs.push({
      path: `${TRAE_RULES_DIR}/${slug}.md`,
      content: rule.body.trim(),
    });
  }

  return outputs;
}

export function generateCommands(canonical: CanonicalFiles): TraeOutput[] {
  return canonical.commands.map((command) => {
    const frontmatter: Record<string, unknown> = {};
    if (command.description) frontmatter.description = command.description;
    return {
      path: `${TRAE_COMMANDS_DIR}/${command.name}.md`,
      content: serializeFrontmatter(frontmatter, command.body.trim() || ''),
    };
  });
}

export function generateAgents(canonical: CanonicalFiles): TraeOutput[] {
  return canonical.agents.map((agent) => {
    const frontmatter: Record<string, unknown> = {
      name: agent.name,
      description: agent.description,
    };
    if (agent.tools.length > 0) frontmatter.tools = agent.tools;
    if (agent.model) frontmatter.model = agent.model;
    return {
      path: `${TRAE_AGENTS_DIR}/${agent.name}.md`,
      content: serializeFrontmatter(frontmatter, agent.body.trim() || ''),
    };
  });
}

export function generateSkills(canonical: CanonicalFiles): TraeOutput[] {
  return generateEmbeddedSkills(canonical, TRAE_SKILLS_DIR);
}

export function generateMcp(canonical: CanonicalFiles): TraeOutput[] {
  if (canonical.mcp === null || Object.keys(canonical.mcp.mcpServers).length === 0) return [];
  return [
    {
      path: TRAE_MCP_FILE,
      content: JSON.stringify({ mcpServers: canonical.mcp.mcpServers }, null, 2),
    },
  ];
}

export function generateIgnore(canonical: CanonicalFiles): TraeOutput[] {
  if (canonical.ignore.length === 0) return [];
  return [{ path: TRAE_IGNORE, content: canonical.ignore.join('\n') }];
}

/**
 * Generate .trae/hooks.json from canonical hooks.
 *
 * Trae uses a flat JSON format (docs.trae.ai/ide/hooks):
 *   { "version": 1, "hooks": { "<Event>": [{ "matcher", "type", "command", "timeout"? }] } }
 *
 * Only command-type hooks are emitted. Prompt/agent hooks have no on-disk
 * equivalent and are dropped so the round-trip stays symmetric.
 */
export function generateHooks(canonical: CanonicalFiles): TraeOutput[] {
  if (!canonical.hooks) return [];
  const hooks: Record<string, unknown[]> = {};
  for (const [event, entries] of Object.entries(canonical.hooks)) {
    if (!Array.isArray(entries)) continue;
    const mapped = entries.flatMap((entry) => {
      if (!hasHookCommand(entry) || entry.type === 'prompt') return [];
      const hook: Record<string, unknown> = {
        matcher: entry.matcher,
        type: 'command',
        command: entry.command,
      };
      if (entry.timeout !== undefined) hook.timeout = entry.timeout;
      return [hook];
    });
    if (mapped.length > 0) hooks[event] = mapped;
  }
  if (Object.keys(hooks).length === 0) return [];
  return [{ path: TRAE_HOOKS_FILE, content: JSON.stringify({ version: 1, hooks }, null, 2) }];
}
