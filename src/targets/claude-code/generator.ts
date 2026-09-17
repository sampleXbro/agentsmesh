/**
 * Generate Claude Code config files from canonical sources.
 */

import type { FeatureGeneratorOutput } from '../catalog/target.interface.js';
import { basename } from 'node:path';
import type { CanonicalFiles } from '../../core/types.js';
import { serializeFrontmatter } from '../../utils/text/markdown.js';
import {
  CLAUDE_ROOT,
  CLAUDE_RULES_DIR,
  CLAUDE_COMMANDS_DIR,
  CLAUDE_AGENTS_DIR,
  CLAUDE_MCP_JSON,
  CLAUDE_SKILLS_DIR,
  CLAUDE_SETTINGS,
  CLAUDE_IGNORE,
} from './constants.js';
import { buildClaudeHooksObjectFromCanonical } from './hooks-format.js';

export type RulesOutput = FeatureGeneratorOutput;

/**
 * Generate the root instruction file from the root rule + .claude/rules/*.md from non-root rules.
 * The root file is emitted at CLAUDE_ROOT (project: `CLAUDE.md`); global scope rewrites it to
 * `.claude/CLAUDE.md` via the global layout's rewriteGeneratedPath.
 * @param canonical - Loaded canonical files
 * @returns root instruction output (from root rule) + .claude/rules/{slug}.md for contextual rules
 */
export function generateRules(canonical: CanonicalFiles): RulesOutput[] {
  const outputs: RulesOutput[] = [];

  const root = canonical.rules.find((r) => r.root);
  if (root) {
    outputs.push({
      path: CLAUDE_ROOT,
      content: root.body.trim() ? root.body : '',
    });
  }

  const nonRoot = canonical.rules.filter(
    (r) => !r.root && (r.targets.length === 0 || r.targets.includes('claude-code')),
  );
  for (const rule of nonRoot) {
    const slug = basename(rule.source, '.md');
    const frontmatter: Record<string, unknown> = {};
    if (rule.description) frontmatter.description = rule.description;
    if (rule.globs.length > 0) frontmatter.globs = rule.globs;
    const content = serializeFrontmatter(frontmatter, rule.body.trim() || '');
    outputs.push({ path: `${CLAUDE_RULES_DIR}/${slug}.md`, content });
  }

  return outputs;
}

/**
 * Generate .claude/commands/*.md from canonical commands.
 * @param canonical - Loaded canonical files
 * @returns Array of command file outputs, or [] if no commands
 */
export function generateCommands(canonical: CanonicalFiles): RulesOutput[] {
  return canonical.commands.map((cmd) => {
    const frontmatter: Record<string, unknown> = {
      description: cmd.description,
      'allowed-tools': cmd.allowedTools.length > 0 ? cmd.allowedTools : undefined,
    };
    if (frontmatter['allowed-tools'] === undefined) delete frontmatter['allowed-tools'];
    const content = serializeFrontmatter(frontmatter, cmd.body.trim() || '');
    return { path: `${CLAUDE_COMMANDS_DIR}/${cmd.name}.md`, content };
  });
}

/**
 * Generate .claude/agents/*.md from canonical agents.
 * @param canonical - Loaded canonical files
 * @returns Array of agent file outputs, or [] if no agents
 */
export function generateAgents(canonical: CanonicalFiles): RulesOutput[] {
  return canonical.agents.map((agent) => {
    const frontmatter: Record<string, unknown> = {
      name: agent.name,
      description: agent.description,
      tools: agent.tools.length > 0 ? agent.tools : undefined,
      disallowedTools: agent.disallowedTools.length > 0 ? agent.disallowedTools : undefined,
      model: agent.model || undefined,
      permissionMode: agent.permissionMode || undefined,
      maxTurns: agent.maxTurns > 0 ? agent.maxTurns : undefined,
      mcpServers: agent.mcpServers.length > 0 ? agent.mcpServers : undefined,
      hooks: Object.keys(agent.hooks).length > 0 ? agent.hooks : undefined,
      skills: agent.skills.length > 0 ? agent.skills : undefined,
      memory: agent.memory || undefined,
    };
    Object.keys(frontmatter).forEach((k) => {
      if (frontmatter[k] === undefined) delete frontmatter[k];
    });
    const rawBody = agent.body.trim() || '';
    const body = /^##\s*Role\b/m.test(rawBody) ? rawBody : `## Role\n\n${rawBody}`;
    const content = serializeFrontmatter(frontmatter, body);
    return { path: `${CLAUDE_AGENTS_DIR}/${agent.name}.md`, content };
  });
}

/**
 * Generate .mcp.json at project root from canonical MCP config.
 * Claude Code uses .mcp.json as the alternative location for MCP server definitions.
 * @param canonical - Loaded canonical files
 * @returns A .mcp.json output when canonical MCP config is present
 */
export function generateMcp(canonical: CanonicalFiles): RulesOutput[] {
  if (!canonical.mcp) return [];
  const content = JSON.stringify({ mcpServers: canonical.mcp.mcpServers }, null, 2);
  return [{ path: CLAUDE_MCP_JSON, content }];
}

/**
 * Generate .claude/skills/{name}/SKILL.md and supporting files from canonical skills.
 * @param canonical - Loaded canonical files
 * @returns Array of skill file outputs (SKILL.md + supporting files per skill)
 */
export function generateSkills(canonical: CanonicalFiles): RulesOutput[] {
  const outputs: RulesOutput[] = [];
  for (const skill of canonical.skills) {
    const frontmatter: Record<string, unknown> = {
      name: skill.name,
      description: skill.description || undefined,
    };
    if (frontmatter.description === undefined) delete frontmatter.description;
    const rawSkillBody = skill.body.trim() || '';
    const skillBody =
      !rawSkillBody || /^##\s*Purpose\b/m.test(rawSkillBody)
        ? rawSkillBody
        : `## Purpose\n\n${rawSkillBody}`;
    const skillContent = serializeFrontmatter(frontmatter, skillBody);
    outputs.push({
      path: `${CLAUDE_SKILLS_DIR}/${skill.name}/SKILL.md`,
      content: skillContent,
    });
    for (const file of skill.supportingFiles) {
      const relPath = file.relativePath.replace(/\\/g, '/');
      outputs.push({
        path: `${CLAUDE_SKILLS_DIR}/${skill.name}/${relPath}`,
        content: file.content,
      });
    }
  }
  return outputs;
}

/**
 * Generate .claude/settings.json with permissions from canonical sources.
 * Merges with existing settings.json to preserve hooks, mcpServers, etc.
 * @param canonical - Loaded canonical files
 * @returns Array with single .claude/settings.json output, or [] if no permissions
 */
export function generatePermissions(canonical: CanonicalFiles): RulesOutput[] {
  if (!canonical.permissions) return [];
  const { allow, deny } = canonical.permissions;
  const ask = canonical.permissions.ask ?? [];
  const content = JSON.stringify({ permissions: { allow, deny, ask } }, null, 2);
  return [{ path: CLAUDE_SETTINGS, content }];
}

/**
 * Generate .claude/settings.json hooks from canonical sources.
 * Merges with existing settings.json to preserve permissions, mcpServers, etc.
 * @param canonical - Loaded canonical files
 * @returns Array with single .claude/settings.json output, or [] if no hooks
 */
export function generateHooks(canonical: CanonicalFiles): RulesOutput[] {
  if (!canonical.hooks) return [];
  const claudeHooks = buildClaudeHooksObjectFromCanonical(canonical);
  // Both scopes write settings.json: Claude Code's documented hook locations are
  // ~/.claude/settings.json, .claude/settings.json, .claude/settings.local.json,
  // managed policy, and plugin/skill/subagent frontmatter — there is no standalone
  // hooks.json. https://code.claude.com/docs/en/hooks
  const content = JSON.stringify({ hooks: claudeHooks }, null, 2);
  return [{ path: CLAUDE_SETTINGS, content }];
}

/**
 * Generate .claudeignore from canonical ignore patterns.
 * Uses gitignore-style syntax (one pattern per line).
 * @param canonical - Loaded canonical files
 * @returns Array with single .claudeignore output, or [] if no patterns
 */
export function generateIgnore(canonical: CanonicalFiles): RulesOutput[] {
  if (!canonical.ignore || canonical.ignore.length === 0) return [];
  const content = canonical.ignore.join('\n');
  return [{ path: CLAUDE_IGNORE, content }];
}
