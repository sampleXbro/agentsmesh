/**
 * Generate GitHub Copilot config files from canonical sources.
 * Copilot uses .github/copilot-instructions.md (global), .github/instructions/*.instructions.md (scoped rules),
 * .github/prompts/*.prompt.md (native prompt files), .github/skills/{name}/ (native skills),
 * .github/agents/*.agent.md (native agents), .github/hooks/agentsmesh.json (+ scripts) for hooks.
 */

import type { FeatureGeneratorOutput } from '../catalog/target.interface.js';
import { basename } from 'node:path';
import type { CanonicalFiles } from '../../core/types.js';
import { serializeFrontmatter } from '../../utils/text/markdown.js';
import {
  COPILOT_INSTRUCTIONS,
  COPILOT_INSTRUCTIONS_DIR,
  COPILOT_SKILLS_DIR,
  COPILOT_AGENTS_DIR,
} from './constants.js';
import { commandPromptPath, serializeCommandPrompt } from './command-prompt.js';

export type RulesOutput = FeatureGeneratorOutput;

function ruleSlug(source: string): string {
  const name = basename(source, '.md');
  return name === '_root' ? 'root' : name;
}

/**
 * Render all canonical rules into a single copilot-instructions.md for global mode.
 * Root rule body first, then non-root rules appended as sections.
 */
export function renderCopilotGlobalInstructions(canonical: CanonicalFiles): string {
  const parts: string[] = [];
  const root = canonical.rules.find((r) => r.root);
  if (root?.body.trim()) parts.push(root.body.trim());
  for (const rule of canonical.rules) {
    if (rule.root) continue;
    if (rule.targets.length > 0 && !rule.targets.includes('copilot')) continue;
    const body = rule.body.trim();
    if (!body) continue;
    const header = rule.description ? `## ${rule.description}` : null;
    if (header) parts.push(`${header}\n\n${body}`);
    else parts.push(body);
  }
  return parts.join('\n\n');
}

/**
 * Build .github/copilot-instructions.md from the canonical root rule.
 * @param canonical - Loaded canonical files
 * @returns Array with copilot-instructions.md output, or [] if no root rule
 */
export function generateRules(canonical: CanonicalFiles): RulesOutput[] {
  const root = canonical.rules.find((r) => r.root);
  const outputs: RulesOutput[] = [];

  if (root) {
    outputs.push({
      path: COPILOT_INSTRUCTIONS,
      content: root.body.trim() || '',
    });
  }

  for (const rule of canonical.rules) {
    if (rule.root) continue;
    if (rule.targets.length > 0 && !rule.targets.includes('copilot')) continue;
    if (rule.globs.length === 0) continue; // only emit when globs are present
    const slug = ruleSlug(rule.source);
    const frontmatter: Record<string, unknown> = {
      description: rule.description || undefined,
      applyTo: rule.globs.length === 1 ? rule.globs[0] : rule.globs,
    };
    Object.keys(frontmatter).forEach((k) => {
      if (frontmatter[k] === undefined) delete frontmatter[k];
    });
    const content = serializeFrontmatter(frontmatter, rule.body.trim() || '');
    outputs.push({ path: `${COPILOT_INSTRUCTIONS_DIR}/${slug}.instructions.md`, content });
  }

  return outputs;
}

export function generateCommands(canonical: CanonicalFiles): RulesOutput[] {
  return canonical.commands.map((command) => ({
    path: commandPromptPath(command.name),
    content: serializeCommandPrompt(command),
  }));
}

/**
 * Generate .github/skills/{name}/SKILL.md and supporting files from canonical skills.
 * Copilot Agent Skills use SKILL.md with name/description frontmatter.
 * @param canonical - Loaded canonical files
 * @returns Array of skill file outputs
 */
export function generateSkills(canonical: CanonicalFiles): RulesOutput[] {
  const outputs: RulesOutput[] = [];
  for (const skill of canonical.skills) {
    const frontmatter: Record<string, unknown> = {
      name: skill.name,
      description: skill.description || undefined,
    };
    if (frontmatter.description === undefined) delete frontmatter.description;
    const skillContent = serializeFrontmatter(frontmatter, skill.body.trim() || '');
    outputs.push({
      path: `${COPILOT_SKILLS_DIR}/${skill.name}/SKILL.md`,
      content: skillContent,
    });
    for (const file of skill.supportingFiles) {
      const relPath = file.relativePath.replace(/\\/g, '/');
      outputs.push({
        path: `${COPILOT_SKILLS_DIR}/${skill.name}/${relPath}`,
        content: file.content,
      });
    }
  }
  return outputs;
}

/**
 * Generate .github/agents/{name}.agent.md from canonical agents.
 * Copilot custom agents use .agent.md extension with YAML frontmatter.
 * @param canonical - Loaded canonical files
 * @returns Array of agent file outputs
 */
export function generateAgents(canonical: CanonicalFiles): RulesOutput[] {
  return canonical.agents.map((agent) => {
    const frontmatter: Record<string, unknown> = {
      name: agent.name,
      description: agent.description,
      tools: agent.tools.length > 0 ? agent.tools : undefined,
      model: agent.model || undefined,
      'mcp-servers': agent.mcpServers.length > 0 ? agent.mcpServers : undefined,
      skills: agent.skills.length > 0 ? agent.skills : undefined,
    };
    Object.keys(frontmatter).forEach((k) => {
      if (frontmatter[k] === undefined) delete frontmatter[k];
    });
    const content = serializeFrontmatter(frontmatter, agent.body.trim() || '');
    return { path: `${COPILOT_AGENTS_DIR}/${agent.name}.agent.md`, content };
  });
}

export { generateMcp } from './mcp-generator.js';
export { buildCopilotHooksObject, generateHooks } from './hook-format.js';
