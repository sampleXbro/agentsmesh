import { AB_AGENTS, AB_SKILLS } from '../../core/canonical-paths.js';
import { basename, dirname, join, relative } from 'node:path';
import type { ImportResult } from '../../core/types.js';
import {
  readFileSafe,
  readDirRecursiveNoSymlinks,
  writeFileAtomic,
  mkdirp,
} from '../../utils/filesystem/fs.js';
import { parseFrontmatter } from '../../utils/text/markdown.js';
import {
  serializeImportedAgentWithFallback,
  serializeImportedSkillWithFallback,
} from '../import/import-metadata.js';
import {
  parseProjectedAgentSkillFrontmatter,
  serializeImportedAgent,
} from '../projection/projected-agent-skill.js';
import { GEMINI_SKILLS_DIR, GEMINI_AGENTS_DIR } from './constants.js';

export async function importGeminiSkillsAndAgents(
  projectRoot: string,
  results: ImportResult[],
  normalize: (content: string, sourceFile: string, destinationFile: string) => string,
): Promise<void> {
  const geminiSkillsPath = join(projectRoot, GEMINI_SKILLS_DIR);
  const skillDirs = await readDirRecursiveNoSymlinks(geminiSkillsPath);
  const skillMdFiles = skillDirs.filter((f) => basename(f) === 'SKILL.md');
  for (const srcPath of skillMdFiles) {
    const content = await readFileSafe(srcPath);
    if (!content) continue;
    const skillName = basename(srcPath.slice(0, -'/SKILL.md'.length));
    const rawParsed = parseFrontmatter(content);
    const projectedAgent = parseProjectedAgentSkillFrontmatter(rawParsed.frontmatter, skillName);
    if (projectedAgent) {
      const agentsDir = join(projectRoot, AB_AGENTS);
      await mkdirp(agentsDir);
      const agentPath = join(agentsDir, `${projectedAgent.name}.md`);
      await writeFileAtomic(
        agentPath,
        serializeImportedAgent(projectedAgent, normalize(rawParsed.body, srcPath, agentPath)),
      );
      results.push({
        fromTool: 'gemini-cli',
        fromPath: srcPath,
        toPath: `${AB_AGENTS}/${projectedAgent.name}.md`,
        feature: 'agents',
      });
      continue;
    }
    const destPath = join(projectRoot, AB_SKILLS, skillName, 'SKILL.md');
    const normalized = normalize(content, srcPath, destPath);
    const skillDir = join(projectRoot, AB_SKILLS, skillName);
    await mkdirp(skillDir);
    const { frontmatter, body } = parseFrontmatter(normalized);
    await writeFileAtomic(
      destPath,
      await serializeImportedSkillWithFallback(destPath, { ...frontmatter, name: skillName }, body),
    );
    results.push({
      fromTool: 'gemini-cli',
      fromPath: srcPath,
      toPath: `${AB_SKILLS}/${skillName}/SKILL.md`,
      feature: 'skills',
    });
    const allSkillFiles = await readDirRecursiveNoSymlinks(dirname(srcPath));
    for (const absPath of allSkillFiles) {
      if (absPath === srcPath) continue;
      const supportContent = await readFileSafe(absPath);
      if (supportContent === null) continue;
      const relPath = relative(dirname(srcPath), absPath).replace(/\\/g, '/');
      const destSupportPath = join(skillDir, relPath);
      await mkdirp(dirname(destSupportPath));
      await writeFileAtomic(destSupportPath, normalize(supportContent, absPath, destSupportPath));
      results.push({
        fromTool: 'gemini-cli',
        fromPath: absPath,
        toPath: `${AB_SKILLS}/${skillName}/${relPath}`,
        feature: 'skills',
      });
    }
  }

  const geminiAgentsPath = join(projectRoot, GEMINI_AGENTS_DIR);
  try {
    const agentFiles = await readDirRecursiveNoSymlinks(geminiAgentsPath);
    const agentMdFiles = agentFiles.filter((f) => f.endsWith('.md'));
    for (const srcPath of agentMdFiles) {
      const content = await readFileSafe(srcPath);
      if (!content) continue;
      const { frontmatter, body } = parseFrontmatter(content);
      const relPath = relative(geminiAgentsPath, srcPath).replace(/\\/g, '/');
      const relativeMdPath = relPath.replace(/\.md$/i, '.md');
      const agentsDir = join(projectRoot, AB_AGENTS);
      await mkdirp(agentsDir);
      const destPath = join(agentsDir, relativeMdPath);
      const normalizedBody = normalize(body, srcPath, destPath);
      await writeFileAtomic(
        destPath,
        await serializeImportedAgentWithFallback(
          destPath,
          {
            ...frontmatter,
            name:
              typeof frontmatter.name === 'string'
                ? frontmatter.name
                : basename(relativeMdPath, '.md'),
            maxTurns: frontmatter.maxTurns ?? frontmatter['max-turns'] ?? frontmatter.max_turns,
            permissionMode:
              frontmatter.permissionMode ??
              frontmatter['permission-mode'] ??
              frontmatter.permission_mode,
            disallowedTools:
              frontmatter.disallowedTools ??
              frontmatter['disallowed-tools'] ??
              frontmatter.disallowed_tools,
          },
          normalizedBody,
        ),
      );
      results.push({
        fromTool: 'gemini-cli',
        fromPath: srcPath,
        toPath: `${AB_AGENTS}/${relativeMdPath}`,
        feature: 'agents',
      });
    }
  } catch {
    /* GEMINI_AGENTS_DIR may not exist */
  }
}
