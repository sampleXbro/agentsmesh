/**
 * Generate AugmentCode target outputs from canonical files.
 *
 * Emits:
 *   - `.augment/rules/*.md`          — scoped rules with AugmentCode frontmatter
 *   - `.augment/commands/*.md`       — slash commands
 *   - `.augment/skills/<n>/SKILL.md` — skill bundles
 *   - `.augmentignore`               — workspace ignore patterns
 *
 * MCP, hooks, and permissions are embedded in `.augment/settings.json`
 * via `emitScopedSettings` in the descriptor (not via separate generators).
 *
 * Official docs: https://docs.augmentcode.com/setup-augment/guidelines
 */

import type { FeatureGeneratorOutput } from '../catalog/target.interface.js';
import { basename } from 'node:path';
import type {
  CanonicalFiles,
  CanonicalCommand,
  CanonicalRule,
  CanonicalAgent,
} from '../../core/types.js';
import { generateEmbeddedSkills } from '../import/embedded-skill.js';
import { serializeFrontmatter } from '../../utils/text/markdown.js';
import {
  AUGMENT_CODE_TARGET,
  AUGMENT_CODE_RULES_DIR,
  AUGMENT_CODE_COMMANDS_DIR,
  AUGMENT_CODE_AGENTS_DIR,
  AUGMENT_CODE_SKILLS_DIR,
  AUGMENT_CODE_IGNORE_FILE,
} from './constants.js';

export type AugmentCodeOutput = FeatureGeneratorOutput;

/**
 * Maps a canonical trigger / globs to AugmentCode rule frontmatter.
 * AugmentCode uses a single `type` key (not boolean flags):
 * - `type: always_apply`    — always included (no globs, not manual)
 * - `type: agent_requested` + `description` — agent decides based on description
 */
function ruleFrontmatter(rule: CanonicalRule): Record<string, unknown> {
  const fm: Record<string, unknown> = {};
  if (rule.globs.length > 0 || rule.trigger === 'manual' || rule.trigger === 'model_decision') {
    // Manual and model_decision become agent_requested; glob-triggered also
    fm.type = 'agent_requested';
    if (rule.description) fm.description = rule.description;
    if (rule.globs.length > 0) fm.globs = rule.globs;
  } else {
    fm.type = 'always_apply';
    if (rule.description) fm.description = rule.description;
  }
  return fm;
}

function commandFrontmatter(command: CanonicalCommand): Record<string, unknown> {
  const fm: Record<string, unknown> = {};
  if (command.description) {
    fm.description = command.description;
  }
  return fm;
}

export function generateRules(canonical: CanonicalFiles): AugmentCodeOutput[] {
  const outputs: AugmentCodeOutput[] = [];

  for (const rule of canonical.rules) {
    if (rule.targets.length > 0 && !rule.targets.includes(AUGMENT_CODE_TARGET)) continue;
    if (rule.root) {
      // Root rule -> _root.md (type: always_apply)
      const fm: Record<string, unknown> = { type: 'always_apply' };
      if (rule.description) fm.description = rule.description;
      outputs.push({
        path: `${AUGMENT_CODE_RULES_DIR}/_root.md`,
        content: serializeFrontmatter(fm, rule.body.trim()),
      });
    } else {
      const slug = basename(rule.source, '.md');
      outputs.push({
        path: `${AUGMENT_CODE_RULES_DIR}/${slug}.md`,
        content: serializeFrontmatter(ruleFrontmatter(rule), rule.body.trim()),
      });
    }
  }

  return outputs;
}

export function generateCommands(canonical: CanonicalFiles): AugmentCodeOutput[] {
  return canonical.commands.map((command) => ({
    path: `${AUGMENT_CODE_COMMANDS_DIR}/${command.name}.md`,
    content: serializeFrontmatter(commandFrontmatter(command), command.body.trim()),
  }));
}

function agentFrontmatter(agent: CanonicalAgent): Record<string, unknown> {
  const fm: Record<string, unknown> = { name: agent.name };
  if (agent.description) fm.description = agent.description;
  return fm;
}

export function generateAgents(canonical: CanonicalFiles): AugmentCodeOutput[] {
  return canonical.agents.map((agent) => ({
    path: `${AUGMENT_CODE_AGENTS_DIR}/${agent.name}.md`,
    content: serializeFrontmatter(agentFrontmatter(agent), agent.body.trim()),
  }));
}

export function generateSkills(canonical: CanonicalFiles): AugmentCodeOutput[] {
  return generateEmbeddedSkills(canonical, AUGMENT_CODE_SKILLS_DIR);
}

export function generateIgnore(canonical: CanonicalFiles): AugmentCodeOutput[] {
  if (canonical.ignore.length === 0) return [];
  return [
    {
      path: AUGMENT_CODE_IGNORE_FILE,
      content: canonical.ignore.join('\n'),
    },
  ];
}
