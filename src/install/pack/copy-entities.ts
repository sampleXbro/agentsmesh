import { join, basename, dirname } from 'node:path';
import { copyFile } from 'node:fs/promises';
import { stringify as yamlStringify } from 'yaml';
import type { CanonicalFiles } from '../../core/types.js';
import { writeFileAtomic, mkdirp } from '../../utils/filesystem/fs.js';
import type { PreservedRootFile } from '../source/collect-preserved-root.js';

/**
 * Copy each entity's source file into `packDir/<subdirectory>/`, flattened to
 * its basename. Used for rules, commands and agents.
 */
export async function copyEntitiesInto(
  packDir: string,
  subdirectory: string,
  entities: readonly { source: string }[],
): Promise<void> {
  if (entities.length === 0) return;
  const dir = join(packDir, subdirectory);
  await mkdirp(dir);
  for (const entity of entities) {
    await copyFile(entity.source, join(dir, basename(entity.source)));
  }
}

/** Copy skills to packDir/skills/{name}/ with SKILL.md and supporting files. */
export async function copySkillsInto(canonical: CanonicalFiles, packDir: string): Promise<void> {
  if (canonical.skills.length === 0) return;
  const skillsDir = join(packDir, 'skills');
  await mkdirp(skillsDir);
  for (const skill of canonical.skills) {
    const destDir = join(skillsDir, skill.name);
    await mkdirp(destDir);
    await copyFile(skill.source, join(destDir, 'SKILL.md'));
    for (const sf of skill.supportingFiles) {
      const destPath = join(destDir, sf.relativePath);
      await mkdirp(dirname(destPath));
      await copyFile(sf.absolutePath, destPath);
    }
  }
}

/**
 * Copy upstream README/LICENSE/NOTICE/… into the pack root verbatim, overwriting
 * on collision. Run before hashing so the bytes count in the pack hash.
 */
export async function copyPreservedRootFilesInto(
  files: readonly PreservedRootFile[],
  packDir: string,
): Promise<void> {
  for (const file of files) {
    await copyFile(file.absolutePath, join(packDir, file.relativePath));
  }
}

/** Write mcp.json, permissions.yaml, hooks.yaml and ignore when present. */
export async function writeSettingsInto(canonical: CanonicalFiles, packDir: string): Promise<void> {
  if (canonical.mcp !== null) {
    await writeFileAtomic(join(packDir, 'mcp.json'), `${JSON.stringify(canonical.mcp, null, 2)}\n`);
  }
  if (canonical.permissions !== null) {
    await writeFileAtomic(join(packDir, 'permissions.yaml'), yamlStringify(canonical.permissions));
  }
  if (canonical.hooks !== null) {
    await writeFileAtomic(join(packDir, 'hooks.yaml'), yamlStringify(canonical.hooks));
  }
  if (canonical.ignore.length > 0) {
    await writeFileAtomic(join(packDir, 'ignore'), `${canonical.ignore.join('\n')}\n`);
  }
}
