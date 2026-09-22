import { NO_OUTPUTS } from '../catalog/no-outputs.js';
import type { FeatureGeneratorOutput } from '../catalog/target.interface.js';
import { basename } from 'node:path';
import type { CanonicalFiles, CanonicalRule } from '../../core/types.js';
import { generateEmbeddedSkills } from '../import/embedded-skill.js';
import { commandSkillDirName, serializeCommandSkill } from '../codex-cli/command-skill.js';
import { serializeFrontmatter } from '../../utils/text/markdown.js';
import { generateKiroHooks } from './hook-format.js';
import type { KiroPermissionRule } from './permissions-format.js';
import {
  KIRO_TARGET,
  KIRO_AGENTS_MD,
  KIRO_STEERING_DIR,
  KIRO_SKILLS_DIR,
  KIRO_AGENTS_DIR,
  KIRO_MCP_FILE,
  KIRO_HOOKS_DIR,
  KIRO_IGNORE,
} from './constants.js';
import { ignoreOutput } from '../catalog/ignore-output.js';

export type KiroOutput = FeatureGeneratorOutput;

function steeringFrontmatter(rule: CanonicalRule): Record<string, unknown> {
  const frontmatter: Record<string, unknown> = {};
  if (rule.globs.length > 0) {
    frontmatter.inclusion = 'fileMatch';
    frontmatter.fileMatchPattern = rule.globs.length === 1 ? rule.globs[0] : rule.globs;
  } else if (rule.trigger === 'manual') {
    frontmatter.inclusion = 'manual';
  } else if (rule.trigger === 'model_decision') {
    frontmatter.inclusion = 'auto';
  } else {
    frontmatter.inclusion = 'always';
  }
  if (rule.description) frontmatter.description = rule.description;
  return frontmatter;
}

export function generateRules(canonical: CanonicalFiles): KiroOutput[] {
  const outputs: KiroOutput[] = [];
  const root = canonical.rules.find((rule) => rule.root);
  if (root) {
    outputs.push({ path: KIRO_AGENTS_MD, content: root.body.trim() || '' });
  }
  for (const rule of canonical.rules) {
    if (rule.root) continue;
    if (rule.targets.length > 0 && !rule.targets.includes(KIRO_TARGET)) continue;
    const slug = basename(rule.source, '.md');
    outputs.push({
      path: `${KIRO_STEERING_DIR}/${slug}.md`,
      content: serializeFrontmatter(steeringFrontmatter(rule), rule.body.trim() || ''),
    });
  }
  return outputs;
}

export function generateCommands(canonical: CanonicalFiles): KiroOutput[] {
  return canonical.commands.map((command) => ({
    path: `${KIRO_SKILLS_DIR}/${commandSkillDirName(command.name)}/SKILL.md`,
    content: serializeCommandSkill(command),
  }));
}

export function generateSkills(canonical: CanonicalFiles): KiroOutput[] {
  return generateEmbeddedSkills(canonical, KIRO_SKILLS_DIR);
}

export function generateMcp(canonical: CanonicalFiles): KiroOutput[] {
  if (!canonical.mcp || Object.keys(canonical.mcp.mcpServers).length === 0) return [];
  return [
    {
      path: KIRO_MCP_FILE,
      content: JSON.stringify({ mcpServers: canonical.mcp.mcpServers }, null, 2),
    },
  ];
}

export function generateHooks(canonical: CanonicalFiles): KiroOutput[] {
  if (!canonical.hooks || Object.keys(canonical.hooks).length === 0) return [];
  return generateKiroHooks(canonical.hooks).map((hook) => ({
    path: `${KIRO_HOOKS_DIR}/${hook.name}`,
    content: hook.content,
  }));
}

/**
 * Agent profiles, optionally carrying embedded permission rules.
 *
 * `rules` is only ever passed by `emitKiroAgentPermissions`, the one hook that
 * sees the enabled feature set — an agents-only run must never leak permissions
 * into the profile, and a revoked rule must disappear from it.
 */
export function buildKiroAgentOutputs(
  canonical: CanonicalFiles,
  rules: readonly KiroPermissionRule[] = [],
): KiroOutput[] {
  return canonical.agents.map((agent) => {
    const frontmatter: Record<string, unknown> = {
      name: agent.name,
      description: agent.description,
      tools: agent.tools.length > 0 ? agent.tools : undefined,
      model: agent.model || undefined,
      permissions: rules.length > 0 ? { rules } : undefined,
    };
    Object.keys(frontmatter).forEach((k) => {
      if (frontmatter[k] === undefined) delete frontmatter[k];
    });
    const content = serializeFrontmatter(frontmatter, agent.body.trim() || '');
    return { path: `${KIRO_AGENTS_DIR}/${agent.name}.md`, content };
  });
}

export function generateAgents(canonical: CanonicalFiles): KiroOutput[] {
  return buildKiroAgentOutputs(canonical);
}

export const generateIgnore = ignoreOutput(KIRO_IGNORE);

export const generatePermissions = NO_OUTPUTS;
