/**
 * Generate Zed target outputs from canonical files.
 *
 * Emits:
 *   - `.rules`                              — root rule + embedded non-root rules
 *     (rewritten to `~/.config/zed/AGENTS.md` in global scope)
 *   - `.agents/skills/{name}/SKILL.md`      — skill bundles
 *   - `.agents/skills/am-command-{name}/`   — commands, projected as skills
 *
 * MCP, ignore and permissions are emitted via `emitScopedSettings` (not their own
 * generators) because all three land in the same `settings.json` and need one
 * key-scoped merge — see `scoped-settings.ts`.
 */

import { embeddedRootRule } from '../projection/managed-blocks.js';
import type { FeatureGeneratorOutput } from '../catalog/target.interface.js';
import type { CanonicalFiles } from '../../core/types.js';
import { generateEmbeddedSkills } from '../import/embedded-skill.js';
import { commandSkillDirName, serializeCommandSkill } from '../codex-cli/command-skill.js';
import { ZED_TARGET, ZED_ROOT_FILE, ZED_SKILLS_DIR } from './constants.js';

export type ZedOutput = FeatureGeneratorOutput;

export function generateSkills(canonical: CanonicalFiles): ZedOutput[] {
  return generateEmbeddedSkills(canonical, ZED_SKILLS_DIR);
}

/**
 * Zed has no command file format; `docs/src/ai/skills.md` documents skills as
 * `/skill-name` slash commands instead. The serializer is the shared one that
 * codex-cli (the owner of `.agents/skills/`), warp and amp already use, so the
 * two targets produce byte-identical files and the shared skill importer
 * recognises the `x-agentsmesh-kind: command` marker on the way back.
 */
export function generateCommands(canonical: CanonicalFiles): ZedOutput[] {
  return canonical.commands.map((command) => ({
    path: `${ZED_SKILLS_DIR}/${commandSkillDirName(command.name)}/SKILL.md`,
    content: serializeCommandSkill(command),
  }));
}

export const generateRules = (canonical: CanonicalFiles): ZedOutput[] =>
  embeddedRootRule(canonical, ZED_TARGET, ZED_ROOT_FILE);
