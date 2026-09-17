/**
 * Cursor skills import adapter - handles both directory-structured and flat skills.
 */

import { AB_SKILLS } from '../../core/canonical-paths.js';
import { join, basename } from 'node:path';
import type { ImportResult } from '../../core/types.js';
import { readDirRecursiveNoSymlinks, readFileSafe } from '../../utils/filesystem/fs.js';
import {
  findDirectorySkills,
  importDirectorySkill,
  importFlatSkill,
  type SkillImportOptions,
} from '../import/shared/skill-import-pipeline.js';
import { CURSOR_SKILLS_DIR } from './constants.js';

export async function importSkills(
  projectRoot: string,
  results: ImportResult[],
  normalize: (content: string, sourceFile: string, destinationFile: string) => string,
  skillsRelDir: string = CURSOR_SKILLS_DIR,
): Promise<void> {
  const skillsDir = join(projectRoot, skillsRelDir);
  const directorySkills = await findDirectorySkills(skillsDir);

  const options: SkillImportOptions = {
    projectRoot,
    destCanonicalSkillsDir: AB_SKILLS,
    targetName: 'cursor',
    normalize,
    results,
  };

  // Import directory-structured skills
  for (const [skillName, skillDir] of directorySkills) {
    await importDirectorySkill(skillName, skillDir, options);
  }

  // Import flat skills (remaining .md files not in directories)
  const allFiles = await readDirRecursiveNoSymlinks(skillsDir).catch(() => []);
  const mdFiles = allFiles.filter((f) => f.endsWith('.md'));
  const handledPaths = new Set(
    Array.from(directorySkills.values()).flatMap((dir) =>
      allFiles.filter((f) => f.startsWith(dir)),
    ),
  );

  for (const srcPath of mdFiles) {
    if (handledPaths.has(srcPath)) continue;
    const content = await readFileSafe(srcPath);
    if (!content) continue;
    const name = basename(srcPath, '.md');
    await importFlatSkill(name, srcPath, content, options);
  }
}
