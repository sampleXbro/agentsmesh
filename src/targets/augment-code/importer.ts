/**
 * Import AugmentCode config into canonical `.agentsmesh/`.
 *
 * Reads:
 *   - `.augment/rules/*.md`          — scoped rules (frontmatter-driven)
 *   - `.augment/commands/*.md`       — slash commands
 *   - `.augment/skills/<n>/SKILL.md` — skill bundles
 *   - `.augment/settings.json`       — MCP, hooks, tool permissions
 *   - `.augmentignore`               — workspace ignore patterns
 *
 * Global scope reads equivalent paths under `~/.augment/`.
 */

import { AB_AGENTS, AB_RULES } from '../../core/canonical-paths.js';
import { basename, join } from 'node:path';
import type { ImportResult } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { createImportReferenceNormalizer } from '../../core/reference/import-rewriter.js';
import { importFileDirectory } from '../import/import-orchestrator.js';
import { importEmbeddedSkills } from '../import/embedded-skill.js';
import {
  serializeImportedRuleWithFallback,
  serializeImportedCommandWithFallback,
  serializeImportedAgentWithFallback,
} from '../import/import-metadata.js';
import { parseFrontmatter } from '../../utils/text/markdown.js';
import { importAugmentSettings, importAugmentIgnore } from './settings-helpers.js';
import {
  AUGMENT_CODE_TARGET,
  AUGMENT_CODE_RULES_DIR,
  AUGMENT_CODE_COMMANDS_DIR,
  AUGMENT_CODE_AGENTS_DIR,
  AUGMENT_CODE_SKILLS_DIR,
  AUGMENT_CODE_SETTINGS_FILE,
  AUGMENT_CODE_IGNORE_FILE,
  AUGMENT_CODE_GLOBAL_RULES_DIR,
  AUGMENT_CODE_GLOBAL_COMMANDS_DIR,
  AUGMENT_CODE_GLOBAL_AGENTS_DIR,
  AUGMENT_CODE_GLOBAL_SKILLS_DIR,
  AUGMENT_CODE_GLOBAL_SETTINGS_FILE,
} from './constants.js';

type Normalize = (content: string, sourceFile: string, destinationFile: string) => string;

/** Convert AugmentCode rule frontmatter to canonical rule metadata. */
function canonicalRuleMeta(
  frontmatter: Record<string, unknown>,
  isRoot: boolean,
): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    root: isRoot,
    description: typeof frontmatter.description === 'string' ? frontmatter.description : undefined,
    globs: Array.isArray(frontmatter.globs) ? frontmatter.globs : [],
  };
  // AugmentCode `type: agent_requested` maps to the model_decision trigger.
  // Accept the legacy boolean `agent_requested: true` for backward compatibility.
  if (frontmatter.type === 'agent_requested' || frontmatter.agent_requested === true) {
    meta.trigger = 'model_decision';
  }
  return meta;
}

async function importRules(
  projectRoot: string,
  results: ImportResult[],
  normalize: Normalize,
  scope: TargetLayoutScope,
): Promise<void> {
  const rulesDir = scope === 'global' ? AUGMENT_CODE_GLOBAL_RULES_DIR : AUGMENT_CODE_RULES_DIR;
  const destDir = join(projectRoot, AB_RULES);

  results.push(
    ...(await importFileDirectory({
      srcDir: join(projectRoot, rulesDir),
      destDir,
      extensions: ['.md'],
      fromTool: AUGMENT_CODE_TARGET,
      normalize,
      mapEntry: async ({ relativePath, normalizeTo }) => {
        const isRoot = relativePath === '_root.md' || basename(relativePath) === '_root.md';
        const destPath = join(destDir, relativePath);
        const { frontmatter, body } = parseFrontmatter(normalizeTo(destPath));
        return {
          destPath,
          toPath: `${AB_RULES}/${relativePath}`,
          feature: 'rules',
          content: await serializeImportedRuleWithFallback(
            destPath,
            canonicalRuleMeta(frontmatter, isRoot),
            body,
          ),
        };
      },
    })),
  );
}

async function importCommands(
  projectRoot: string,
  results: ImportResult[],
  normalize: Normalize,
  scope: TargetLayoutScope,
): Promise<void> {
  const commandsDir =
    scope === 'global' ? AUGMENT_CODE_GLOBAL_COMMANDS_DIR : AUGMENT_CODE_COMMANDS_DIR;
  const destDir = join(projectRoot, '.agentsmesh/commands');

  results.push(
    ...(await importFileDirectory({
      srcDir: join(projectRoot, commandsDir),
      destDir,
      extensions: ['.md'],
      fromTool: AUGMENT_CODE_TARGET,
      normalize,
      mapEntry: async ({ relativePath, normalizeTo }) => {
        const name = basename(relativePath, '.md');
        const destPath = join(destDir, `${name}.md`);
        const { frontmatter, body } = parseFrontmatter(normalizeTo(destPath));
        const description =
          typeof frontmatter.description === 'string' ? frontmatter.description : '';
        return {
          destPath,
          toPath: `.agentsmesh/commands/${name}.md`,
          feature: 'commands',
          content: await serializeImportedCommandWithFallback(
            destPath,
            { description, hasDescription: true, hasAllowedTools: false },
            body,
          ),
        };
      },
    })),
  );
}

async function importAgents(
  projectRoot: string,
  results: ImportResult[],
  normalize: Normalize,
  scope: TargetLayoutScope,
): Promise<void> {
  const agentsDir = scope === 'global' ? AUGMENT_CODE_GLOBAL_AGENTS_DIR : AUGMENT_CODE_AGENTS_DIR;
  const destDir = join(projectRoot, AB_AGENTS);

  results.push(
    ...(await importFileDirectory({
      srcDir: join(projectRoot, agentsDir),
      destDir,
      extensions: ['.md'],
      fromTool: AUGMENT_CODE_TARGET,
      normalize,
      mapEntry: async ({ relativePath, normalizeTo }) => {
        const destPath = join(destDir, relativePath);
        const { frontmatter, body } = parseFrontmatter(normalizeTo(destPath));
        return {
          destPath,
          toPath: `${AB_AGENTS}/${relativePath}`,
          feature: 'agents',
          content: await serializeImportedAgentWithFallback(destPath, frontmatter, body),
        };
      },
    })),
  );
}

export async function importFromAugmentCode(
  projectRoot: string,
  options: { scope?: TargetLayoutScope } = {},
): Promise<ImportResult[]> {
  const scope = options.scope ?? 'project';
  const results: ImportResult[] = [];
  const normalize = await createImportReferenceNormalizer(AUGMENT_CODE_TARGET, projectRoot, scope);

  await importRules(projectRoot, results, normalize, scope);
  await importCommands(projectRoot, results, normalize, scope);
  await importAgents(projectRoot, results, normalize, scope);

  const skillsDir = scope === 'global' ? AUGMENT_CODE_GLOBAL_SKILLS_DIR : AUGMENT_CODE_SKILLS_DIR;
  await importEmbeddedSkills(projectRoot, skillsDir, AUGMENT_CODE_TARGET, results, normalize);

  const settingsFile =
    scope === 'global' ? AUGMENT_CODE_GLOBAL_SETTINGS_FILE : AUGMENT_CODE_SETTINGS_FILE;
  await importAugmentSettings(projectRoot, settingsFile, results);

  if (scope === 'project') {
    await importAugmentIgnore(projectRoot, AUGMENT_CODE_IGNORE_FILE, results);
  }

  return results;
}
