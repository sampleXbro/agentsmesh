/**
 * Generate Aider target outputs from canonical files.
 *
 * Emits:
 *   - `CONVENTIONS.md`    — root rule + embedded non-root rules
 *   - `.aider/skills/`    — skill bundles
 *   - `.aiderignore`      — ignore patterns
 *
 * `.aider.conf.yml` is emitted from `conf-file.ts`: the user owns that file and
 * two features write into it, so it needs one writer and one merge.
 */

import { NO_OUTPUTS } from '../catalog/no-outputs.js';
import type { FeatureGeneratorOutput } from '../catalog/target.interface.js';
import type { CanonicalFiles } from '../../core/types.js';
import { generateEmbeddedSkills } from '../import/embedded-skill.js';
import { appendEmbeddedRulesBlock } from '../projection/managed-blocks.js';
import {
  projectedAgentSkillDirName,
  serializeProjectedAgentSkill,
} from '../projection/projected-agent-skill.js';
import { commandSkillDirName, serializeCommandSkill } from '../codex-cli/command-skill.js';
import { AIDER_TARGET, AIDER_CONVENTIONS, AIDER_SKILLS_DIR, AIDER_IGNORE } from './constants.js';
import { ignoreOutput } from '../catalog/ignore-output.js';

export type AiderOutput = FeatureGeneratorOutput;

/** The CONVENTIONS.md body: root rule plus the embedded non-root rules. */
export function buildAiderConventions(canonical: CanonicalFiles): string {
  const root = canonical.rules.find((rule) => rule.root);
  const nonRootRules = canonical.rules.filter((rule) => {
    if (rule.root) return false;
    return rule.targets.length === 0 || rule.targets.includes(AIDER_TARGET);
  });
  return appendEmbeddedRulesBlock(root?.body.trim() ?? '', nonRootRules);
}

/**
 * Only `CONVENTIONS.md`. The `read:` wiring that makes aider load it lives in
 * `.aider.conf.yml`, which the user also owns — it is emitted from
 * `conf-file.ts` so the whole file has one writer and one merge.
 */
export function generateRules(canonical: CanonicalFiles): AiderOutput[] {
  const content = buildAiderConventions(canonical);
  if (!content) return [];
  return [{ path: AIDER_CONVENTIONS, content }];
}

export function generateSkills(canonical: CanonicalFiles): AiderOutput[] {
  return generateEmbeddedSkills(canonical, AIDER_SKILLS_DIR);
}

export function generateCommands(canonical: CanonicalFiles): AiderOutput[] {
  return canonical.commands.map((command) => ({
    path: `${AIDER_SKILLS_DIR}/${commandSkillDirName(command.name)}/SKILL.md`,
    content: serializeCommandSkill(command),
  }));
}

export function generateAgents(canonical: CanonicalFiles): AiderOutput[] {
  return canonical.agents.map((agent) => ({
    path: `${AIDER_SKILLS_DIR}/${projectedAgentSkillDirName(agent.name)}/SKILL.md`,
    content: serializeProjectedAgentSkill(agent),
  }));
}

export const generateIgnore = ignoreOutput(AIDER_IGNORE);

export const generateMcp = NO_OUTPUTS;

export const generatePermissions = NO_OUTPUTS;
