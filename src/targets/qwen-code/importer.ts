/**
 * Qwen Code target importer — QWEN.md, .qwen/rules, .qwen/commands,
 * .qwen/agents, .qwen/skills, .qwen/settings.json, .qwenignore → canonical .agentsmesh/.
 */

import type { ImportResult } from '../../core/types.js';
import type { TargetLayoutScope } from '../catalog/target-descriptor.js';
import { beginImport } from '../import/descriptor-import-runner.js';
import { importEmbeddedSkills } from '../import/embedded-skill.js';
import { QWEN_CODE_TARGET, QWEN_SKILLS_DIR, QWEN_GLOBAL_SKILLS_DIR } from './constants.js';
import { descriptor } from './index.js';

export async function importFromQwenCode(
  projectRoot: string,
  options: { scope?: TargetLayoutScope } = {},
): Promise<ImportResult[]> {
  const { scope, results, normalize } = await beginImport(descriptor, projectRoot, options);

  const skillsDir = scope === 'global' ? QWEN_GLOBAL_SKILLS_DIR : QWEN_SKILLS_DIR;
  await importEmbeddedSkills(projectRoot, skillsDir, QWEN_CODE_TARGET, results, normalize);

  return results;
}
