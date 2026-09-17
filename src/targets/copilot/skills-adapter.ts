/**
 * Copilot skills import adapter - thin wrapper around shared pipeline.
 */

import { AB_SKILLS } from '../../core/canonical-paths.js';
import { join } from 'node:path';
import type { ImportResult } from '../../core/types.js';
import {
  findDirectorySkills,
  importDirectorySkill,
  type SkillImportOptions,
} from '../import/shared/skill-import-pipeline.js';
import { COPILOT_TARGET, COPILOT_SKILLS_DIR } from './constants.js';

export async function importSkills(
  projectRoot: string,
  results: ImportResult[],
  normalize: (content: string, sourceFile: string, destinationFile: string) => string,
  skillsDirRel: string = COPILOT_SKILLS_DIR,
): Promise<void> {
  const skillsDir = join(projectRoot, skillsDirRel);
  const directorySkills = await findDirectorySkills(skillsDir);

  const options: SkillImportOptions = {
    projectRoot,
    destCanonicalSkillsDir: AB_SKILLS,
    targetName: COPILOT_TARGET,
    normalize,
    results,
  };

  for (const [skillName, skillDir] of directorySkills) {
    await importDirectorySkill(skillName, skillDir, options);
  }
}
