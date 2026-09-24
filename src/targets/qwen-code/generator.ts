/**
 * Generate Qwen Code target outputs from canonical files.
 *
 * Emits:
 *   - `QWEN.md`                — root rule
 *   - `.qwen/rules/<slug>.md`  — non-root scoped rules
 *   - `.qwen/commands/*.md`    — slash commands
 *   - `.qwen/agents/*.md`      — agent definitions
 *   - `.qwen/skills/<name>/`   — skill bundles
 *   - `.qwen/settings.json`    — MCP servers, hooks, permissions config
 *   - `.qwenignore`            — ignore patterns
 */

import type { FeatureGeneratorOutput } from '../catalog/target.interface.js';
import { basename } from 'node:path';
import type { CanonicalFiles } from '../../core/types.js';
import { serializeFrontmatter } from '../../utils/text/markdown.js';
import { buildClaudeHooksObjectFromCanonical } from '../claude-code/hooks-format.js';
import {
  QWEN_CODE_TARGET,
  QWEN_ROOT,
  QWEN_RULES_DIR,
  QWEN_COMMANDS_DIR,
  QWEN_AGENTS_DIR,
  QWEN_SKILLS_DIR,
  QWEN_SETTINGS,
  QWEN_IGNORE,
} from './constants.js';
import { ignoreOutput } from '../catalog/ignore-output.js';

export type QwenCodeOutput = FeatureGeneratorOutput;

/**
 * Generate QWEN.md from root rule and .qwen/rules/<slug>.md for non-root rules.
 */
export function generateRules(canonical: CanonicalFiles): QwenCodeOutput[] {
  const outputs: QwenCodeOutput[] = [];

  const root = canonical.rules.find((r) => r.root);
  if (root) {
    outputs.push({
      path: QWEN_ROOT,
      content: root.body.trim() ? root.body : '',
    });
  }

  const nonRoot = canonical.rules.filter(
    (r) => !r.root && (r.targets.length === 0 || r.targets.includes(QWEN_CODE_TARGET)),
  );
  for (const rule of nonRoot) {
    const slug = basename(rule.source, '.md');
    const frontmatter: Record<string, unknown> = {};
    if (rule.description) frontmatter.description = rule.description;
    // Qwen Code's rulesDiscovery.ts parseRuleFile() only recognizes a `paths:`
    // frontmatter key for path-conditional rule injection (never `globs`).
    if (rule.globs.length > 0) frontmatter.paths = rule.globs;
    const content = serializeFrontmatter(frontmatter, rule.body.trim() || '');
    outputs.push({ path: `${QWEN_RULES_DIR}/${slug}.md`, content });
  }

  return outputs;
}

/**
 * Generate .qwen/commands/<name>.md from canonical commands.
 *
 * Qwen Code's MarkdownCommandDefSchema (markdown-command-parser.ts) only maps
 * `description`, `argument-hint`, `when_to_use`, and `disable-model-invocation`
 * frontmatter into a command definition — there is no tool-restriction field,
 * so canonical `allowedTools` is intentionally dropped here (see lintCommands
 * in ./lint.ts for the corresponding lint warning).
 */
export function generateCommands(canonical: CanonicalFiles): QwenCodeOutput[] {
  return canonical.commands.map((cmd) => {
    const frontmatter: Record<string, unknown> = {
      description: cmd.description,
    };
    const content = serializeFrontmatter(frontmatter, cmd.body.trim() || '');
    return { path: `${QWEN_COMMANDS_DIR}/${cmd.name}.md`, content };
  });
}

/**
 * Generate .qwen/agents/<name>.md from canonical agents.
 */
export function generateAgents(canonical: CanonicalFiles): QwenCodeOutput[] {
  return canonical.agents.map((agent) => {
    const frontmatter: Record<string, unknown> = {
      name: agent.name,
      description: agent.description,
      tools: agent.tools.length > 0 ? agent.tools : undefined,
    };
    Object.keys(frontmatter).forEach((k) => {
      if (frontmatter[k] === undefined) delete frontmatter[k];
    });
    const content = serializeFrontmatter(frontmatter, agent.body.trim() || '');
    return { path: `${QWEN_AGENTS_DIR}/${agent.name}.md`, content };
  });
}

/**
 * Generate .qwen/skills/<name>/SKILL.md and supporting files from canonical skills.
 */
export function generateSkills(canonical: CanonicalFiles): QwenCodeOutput[] {
  const outputs: QwenCodeOutput[] = [];
  for (const skill of canonical.skills) {
    const frontmatter: Record<string, unknown> = {
      name: skill.name,
      description: skill.description || undefined,
    };
    if (frontmatter.description === undefined) delete frontmatter.description;
    const skillContent = serializeFrontmatter(frontmatter, skill.body.trim() || '');
    outputs.push({
      path: `${QWEN_SKILLS_DIR}/${skill.name}/SKILL.md`,
      content: skillContent,
    });
    for (const file of skill.supportingFiles) {
      const relPath = file.relativePath.replace(/\\/g, '/');
      outputs.push({
        path: `${QWEN_SKILLS_DIR}/${skill.name}/${relPath}`,
        content: file.content,
      });
    }
  }
  return outputs;
}

/**
 * Generate .qwen/settings.json with mcpServers from canonical MCP config.
 * Qwen Code uses settings.json (mcpServers key) for MCP configuration.
 */
export function generateMcp(canonical: CanonicalFiles): QwenCodeOutput[] {
  if (!canonical.mcp || Object.keys(canonical.mcp.mcpServers).length === 0) return [];
  const content = JSON.stringify({ mcpServers: canonical.mcp.mcpServers }, null, 2);
  return [{ path: QWEN_SETTINGS, content }];
}

/**
 * Generate .qwenignore from canonical ignore patterns.
 */
export const generateIgnore = ignoreOutput(QWEN_IGNORE);

/**
 * Generate .qwen/settings.json with hooks from canonical hooks config.
 * Qwen Code shares the Claude Code hooks format under the `hooks` key.
 */
export function generateHooks(canonical: CanonicalFiles): QwenCodeOutput[] {
  if (!canonical.hooks || Object.keys(canonical.hooks).length === 0) return [];
  const hooks = buildClaudeHooksObjectFromCanonical(canonical);
  if (Object.keys(hooks).length === 0) return [];
  return [{ path: QWEN_SETTINGS, content: JSON.stringify({ hooks }, null, 2) }];
}

/**
 * Generate .qwen/settings.json with permissions from canonical permissions config.
 */
export function generatePermissions(canonical: CanonicalFiles): QwenCodeOutput[] {
  if (!canonical.permissions) return [];
  const { allow, deny } = canonical.permissions;
  const ask = canonical.permissions.ask ?? [];
  if (allow.length === 0 && deny.length === 0 && ask.length === 0) return [];
  const permissions: Record<string, string[]> = {};
  if (allow.length > 0) permissions.allow = allow;
  if (deny.length > 0) permissions.deny = deny;
  if (ask.length > 0) permissions.ask = ask;
  return [{ path: QWEN_SETTINGS, content: JSON.stringify({ permissions }, null, 2) }];
}
