import type { FeatureGeneratorOutput } from '../catalog/target.interface.js';
import { readdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import type { CanonicalFiles, ImportResult } from '../../core/types.js';
import {
  mkdirp,
  readDirRecursiveNoSymlinks,
  readFileSafe,
  writeFileAtomic,
} from '../../utils/filesystem/fs.js';
import { parseFrontmatter, serializeFrontmatter } from '../../utils/text/markdown.js';
import { serializeImportedSkillWithFallback } from './import-metadata.js';
import {
  parseProjectedAgentSkillFrontmatter,
  serializeImportedAgent,
} from '../projection/projected-agent-skill.js';
import {
  parseCommandSkillFrontmatter,
  serializeImportedCommand,
} from '../codex-cli/command-skill.js';
import { removePathIfExists } from './scoped-agents-import.js';

const AB_SKILLS = '.agentsmesh/skills';
const AB_COMMANDS = '.agentsmesh/commands';
const AB_AGENTS = '.agentsmesh/agents';

export type EmbeddedSkillOutput = FeatureGeneratorOutput;

export function generateEmbeddedSkills(
  canonical: CanonicalFiles,
  skillsDir: string,
): EmbeddedSkillOutput[] {
  const outputs: EmbeddedSkillOutput[] = [];
  for (const skill of canonical.skills) {
    const frontmatter: Record<string, unknown> = {
      name: skill.name,
      description: skill.description || undefined,
    };
    if (frontmatter.description === undefined) delete frontmatter.description;
    outputs.push({
      path: `${skillsDir}/${skill.name}/SKILL.md`,
      content: serializeFrontmatter(frontmatter, skill.body.trim() || ''),
    });
    for (const file of skill.supportingFiles) {
      const relativePath = file.relativePath.replace(/\\/g, '/');
      outputs.push({
        path: `${skillsDir}/${skill.name}/${relativePath}`,
        content: file.content,
      });
    }
  }
  return outputs;
}

export async function importEmbeddedSkills(
  projectRoot: string,
  skillsDir: string,
  fromTool: string,
  results: ImportResult[],
  normalize: (content: string, sourceFile: string, destinationFile: string) => string,
): Promise<void> {
  const entries = await readdir(join(projectRoot, skillsDir), {
    encoding: 'utf8',
    withFileTypes: true,
  }).catch(() => null);
  if (entries === null) return;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sourceSkillDir = join(projectRoot, skillsDir, entry.name);
    const sourceSkillFile = join(sourceSkillDir, 'SKILL.md');
    const sourceSkillContent = await readFileSafe(sourceSkillFile);
    if (sourceSkillContent === null) continue;

    const destinationSkillDir = join(projectRoot, AB_SKILLS, entry.name);
    const destinationSkillFile = join(destinationSkillDir, 'SKILL.md');
    const { frontmatter, body } = parseFrontmatter(
      normalize(sourceSkillContent, sourceSkillFile, destinationSkillFile),
    );

    const projectedCommand = parseCommandSkillFrontmatter(frontmatter, entry.name);
    if (projectedCommand) {
      await removePathIfExists(join(projectRoot, AB_SKILLS, entry.name));
      const destDir = join(projectRoot, AB_COMMANDS);
      await mkdirp(destDir);
      const commandPath = join(destDir, `${projectedCommand.name}.md`);
      await writeFileAtomic(
        commandPath,
        serializeImportedCommand(projectedCommand, normalize(body, sourceSkillFile, commandPath)),
      );
      results.push({
        fromTool,
        fromPath: sourceSkillFile,
        toPath: `${AB_COMMANDS}/${projectedCommand.name}.md`,
        feature: 'commands',
      });
      continue;
    }

    const projectedAgent = parseProjectedAgentSkillFrontmatter(frontmatter, entry.name);
    if (projectedAgent) {
      await removePathIfExists(join(projectRoot, AB_SKILLS, entry.name));
      const destDir = join(projectRoot, AB_AGENTS);
      await mkdirp(destDir);
      const agentPath = join(destDir, `${projectedAgent.name}.md`);
      await writeFileAtomic(
        agentPath,
        serializeImportedAgent(projectedAgent, normalize(body, sourceSkillFile, agentPath)),
      );
      results.push({
        fromTool,
        fromPath: sourceSkillFile,
        toPath: `${AB_AGENTS}/${projectedAgent.name}.md`,
        feature: 'agents',
      });
      continue;
    }

    const output = await serializeImportedSkillWithFallback(
      destinationSkillFile,
      { ...frontmatter, name: entry.name },
      body,
    );
    await mkdirp(destinationSkillDir);
    await writeFileAtomic(destinationSkillFile, output);
    results.push({
      fromTool,
      fromPath: sourceSkillFile,
      toPath: `${AB_SKILLS}/${entry.name}/SKILL.md`,
      feature: 'skills',
    });

    const sourceFiles = await readDirRecursiveNoSymlinks(sourceSkillDir);
    for (const sourcePath of sourceFiles) {
      if (sourcePath === sourceSkillFile) continue;
      const relativePath = relative(sourceSkillDir, sourcePath).replace(/\\/g, '/');
      const sourceContent = await readFileSafe(sourcePath);
      if (sourceContent === null) continue;
      const destinationPath = join(destinationSkillDir, relativePath);
      await mkdirp(dirname(destinationPath));
      await writeFileAtomic(destinationPath, normalize(sourceContent, sourcePath, destinationPath));
      results.push({
        fromTool,
        fromPath: sourcePath,
        toPath: `${AB_SKILLS}/${entry.name}/${relativePath}`,
        feature: 'skills',
      });
    }
  }
}
