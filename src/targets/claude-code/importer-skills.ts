import { AB_SKILLS } from '../../core/canonical-paths.js';
import { basename, dirname, join, relative } from 'node:path';
import type { ImportResult } from '../../core/types.js';
import {
  readFileSafe,
  readDirRecursiveNoSymlinks,
  writeFileAtomic,
  mkdirp,
} from '../../utils/filesystem/fs.js';
import { tryParseFrontmatter } from '../../utils/text/markdown.js';
import { serializeImportedSkillWithFallback } from '../import/import-metadata.js';
import { CLAUDE_SKILLS_DIR } from './constants.js';

export async function importClaudeSkills(
  projectRoot: string,
  results: ImportResult[],
  normalize: (content: string, sourceFile: string, destinationFile: string) => string,
): Promise<void> {
  const skillsBaseDir = join(projectRoot, CLAUDE_SKILLS_DIR);
  const destBase = join(projectRoot, AB_SKILLS);

  const allFiles = await readDirRecursiveNoSymlinks(skillsBaseDir);
  const skillMdFiles = allFiles.filter((f) => f.endsWith('SKILL.md'));

  for (const skillMdPath of skillMdFiles) {
    const skillDir = dirname(skillMdPath);
    const skillName = basename(skillDir);
    const destSkillDir = join(destBase, skillName);

    // Lenient parse on SKILL.md so a single malformed third-party skill skips
    // the whole skill subtree instead of aborting the install. Without this,
    // repos like christianestay/claude-code-base-project (unquoted scalars
    // with embedded colons, e.g. `argument-hint: ej. feat: add auth`) crash
    // the YAML parser before any sibling skill is staged.
    const skillMdContent = await readFileSafe(skillMdPath);
    if (skillMdContent === null) continue;
    const normalizedSkillMd = normalize(
      skillMdContent,
      skillMdPath,
      join(destSkillDir, 'SKILL.md'),
    );
    const skillMdParsed = tryParseFrontmatter(normalizedSkillMd, skillMdPath);
    if (!skillMdParsed.ok) {
      process.stderr.write(`⚠ skipping ${skillMdPath}: ${skillMdParsed.error.message}\n`);
      continue;
    }

    const skillFiles = await readDirRecursiveNoSymlinks(skillDir);
    for (const filePath of skillFiles) {
      const fileContent = await readFileSafe(filePath);
      if (fileContent === null) continue;
      const relPath = relative(skillDir, filePath);
      const destPath = join(destSkillDir, relPath);
      await mkdirp(dirname(destPath));
      const normalized = normalize(fileContent, filePath, destPath);
      await writeFileAtomic(
        destPath,
        relPath === 'SKILL.md'
          ? await serializeImportedSkillWithFallback(
              destPath,
              skillMdParsed.value.frontmatter,
              skillMdParsed.value.body,
            )
          : normalized,
      );
      const toPath = `${AB_SKILLS}/${skillName}/${relPath}`;
      results.push({
        fromTool: 'claude-code',
        fromPath: filePath,
        toPath,
        feature: 'skills',
      });
    }
  }
}
