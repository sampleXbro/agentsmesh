/**
 * Generate Cline config files from canonical sources.
 * Cline (standalone CLI) uses .cline/rules (rules), .clineignore (project-only
 * ignore), .cline/mcp.json (project-only MCP), .cline/skills (skills),
 * .cline/agents.yaml (agents), and .clinerules/workflows (commands — an
 * IDE-era path not covered by the CLI reference, kept unchanged).
 */

import { NO_OUTPUTS } from '../catalog/no-outputs.js';
import type { FeatureGeneratorOutput } from '../catalog/target.interface.js';
import { basename } from 'node:path';
import type { CanonicalFiles } from '../../core/types.js';
import { serializeFrontmatter } from '../../utils/text/markdown.js';
import type { GenerateFeatureContext } from '../catalog/target.interface.js';
import {
  CLINE_RULES_DIR,
  CLINE_AGENTS_MD,
  CLINE_IGNORE,
  CLINE_MCP_SETTINGS,
  CLINE_SKILLS_DIR,
  CLINE_WORKFLOWS_DIR,
} from './constants.js';

export { generateAgents } from './agent-generator.js';
export { generateHooks } from './hook-generator.js';

export type RulesOutput = FeatureGeneratorOutput;

function ruleSlug(source: string): string {
  const name = basename(source, '.md');
  return name === '_root' ? 'root' : name;
}

/**
 * Generate .cline/rules/*.md from canonical rules.
 * Cline supports plain markdown with optional frontmatter.
 * Root rule → AGENTS.md, non-root → .cline/rules/{slug}.md
 *
 * @param canonical - Loaded canonical files
 * @returns Array of rule outputs, or [] if no rules for cline
 */
export function generateRules(canonical: CanonicalFiles): RulesOutput[] {
  const outputs: RulesOutput[] = [];
  const root = canonical.rules.find((r) => r.root);

  if (root) {
    const body = root.body.trim() ? root.body : '';
    outputs.push({ path: CLINE_AGENTS_MD, content: body });
  }

  for (const rule of canonical.rules) {
    if (rule.root) continue;
    if (rule.targets.length > 0 && !rule.targets.includes('cline')) continue;
    const slug = ruleSlug(rule.source);
    const frontmatter: Record<string, unknown> = {
      description: rule.description || undefined,
      paths: rule.globs.length > 0 ? rule.globs : undefined,
    };
    Object.keys(frontmatter).forEach((k) => {
      if (frontmatter[k] === undefined) delete frontmatter[k];
    });
    const content =
      Object.keys(frontmatter).length > 0
        ? serializeFrontmatter(frontmatter, rule.body.trim() || '')
        : rule.body.trim() || '';
    outputs.push({ path: `${CLINE_RULES_DIR}/${slug}.md`, content });
  }

  return outputs;
}

/**
 * Generate .clinerules/workflows/{name}.md from canonical commands.
 * Cline workflows are slash-invokable prompts analogous to Cursor/Windsurf commands.
 * Per Cline doc section 6.4: command description → workflow intro paragraph.
 *
 * @param canonical - Loaded canonical files
 * @returns Array of workflow file outputs, or [] if no commands
 */
export function generateCommands(canonical: CanonicalFiles): RulesOutput[] {
  return canonical.commands.map((cmd) => {
    const desc = cmd.description.trim();
    const body = cmd.body.trim();
    const content = desc && body ? `${desc}\n\n${body}` : desc || body;
    return { path: `${CLINE_WORKFLOWS_DIR}/${cmd.name}.md`, content };
  });
}

/**
 * Generate .clineignore from canonical ignore patterns.
 * Project-only: no documented global `.clineignore` equivalent exists
 * (docs.cline.bot/customization/clineignore is explicitly workspace-root
 * scoped), so this is a no-op for global scope.
 *
 * @param canonical - Loaded canonical files
 * @param ctx - Feature context (scope-gated: project only)
 * @returns Array with single .clineignore output, or [] if no patterns or global scope
 */
export function generateIgnore(
  canonical: CanonicalFiles,
  ctx?: GenerateFeatureContext,
): RulesOutput[] {
  if (ctx?.scope === 'global') return [];
  if (!canonical.ignore || canonical.ignore.length === 0) return [];
  const content = canonical.ignore.join('\n');
  return [{ path: CLINE_IGNORE, content }];
}

/**
 * Generate .cline/mcp.json from canonical MCP config.
 * Cline uses mcpServers format compatible with canonical.
 * Project-only: the CLI reference documents `.cline/mcp.json` only under the
 * project-level `.cline/` tree — no global MCP path is documented.
 *
 * @param canonical - Loaded canonical files
 * @param ctx - Feature context (scope-gated: project only)
 * @returns Array with single output, or [] if no MCP or global scope
 */
export function generateMcp(
  canonical: CanonicalFiles,
  ctx?: GenerateFeatureContext,
): RulesOutput[] {
  if (ctx?.scope === 'global') return [];
  if (!canonical.mcp || Object.keys(canonical.mcp.mcpServers).length === 0) return [];
  const content = JSON.stringify({ mcpServers: canonical.mcp.mcpServers }, null, 2);
  return [{ path: CLINE_MCP_SETTINGS, content }];
}

export const generatePermissions = NO_OUTPUTS;

/**
 * Generate .cline/skills/{name}/SKILL.md and supporting files.
 *
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
      path: `${CLINE_SKILLS_DIR}/${skill.name}/SKILL.md`,
      content: skillContent,
    });
    for (const file of skill.supportingFiles) {
      const relPath = file.relativePath.replace(/\\/g, '/');
      outputs.push({
        path: `${CLINE_SKILLS_DIR}/${skill.name}/${relPath}`,
        content: file.content,
      });
    }
  }
  return outputs;
}
