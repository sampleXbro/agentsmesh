/**
 * Shared skill import pipeline for all targets.
 * Consolidates common skill import logic to avoid duplication across targets.
 */

import { join, basename, dirname, relative } from 'node:path';
import type { ImportResult } from '../../../core/types.js';
import {
  readFileSafe,
  readDirRecursiveNoSymlinks,
  writeFileAtomic,
  mkdirp,
} from '../../../utils/filesystem/fs.js';
import { parseFrontmatter } from '../../../utils/text/markdown.js';
import { serializeImportedSkillWithFallback } from '../import-metadata.js';
import { isReservedArtifactName } from './reserved.js';
import {
  parseProjectedAgentSkillFrontmatter,
  serializeImportedAgent,
} from '../../projection/projected-agent-skill.js';
import {
  parseCommandSkillFrontmatter,
  serializeImportedCommand,
} from '../../codex-cli/command-skill.js';
import { removePathIfExists } from '../scoped-agents-import.js';

export interface SkillImportOptions {
  /** Project root directory */
  projectRoot: string;
  /** Destination canonical skills directory (relative to project root) */
  destCanonicalSkillsDir: string;
  /** Target name for import results */
  targetName: string;
  /** Content normalizer function */
  normalize: (content: string, sourceFile: string, destinationFile: string) => string;
  /** Import results array to append to */
  results: ImportResult[];
}

export interface SkillEntry {
  /** Absolute path to the file */
  absolutePath: string;
  /** Relative path within the skill directory */
  relativePath: string;
  /** File content */
  content: string;
}

/**
 * Read a native skill directory and return all files.
 * Filters out reserved artifact names.
 */
export async function readNativeSkill(skillDir: string): Promise<SkillEntry[]> {
  const allFiles = await readDirRecursiveNoSymlinks(skillDir).catch(() => []);
  const entries: SkillEntry[] = [];

  for (const absPath of allFiles) {
    const relPath = relative(skillDir, absPath).replace(/\\/g, '/');
    const filename = basename(relPath);

    // Skip reserved artifacts
    if (isReservedArtifactName(filename)) {
      continue;
    }

    const content = await readFileSafe(absPath);
    if (content === null) continue;

    entries.push({
      absolutePath: absPath,
      relativePath: relPath,
      content,
    });
  }

  return entries;
}

/**
 * Import a directory-structured skill (with SKILL.md + supporting files).
 */
export async function importDirectorySkill(
  skillName: string,
  skillDir: string,
  options: SkillImportOptions,
): Promise<void> {
  const entries = await readNativeSkill(skillDir);
  const destSkillDir = join(options.projectRoot, options.destCanonicalSkillsDir, skillName);

  for (const entry of entries) {
    const destPath = join(destSkillDir, entry.relativePath);
    await mkdirp(dirname(destPath));

    const normalized = options.normalize(entry.content, entry.absolutePath, destPath);

    // Special handling for SKILL.md
    if (entry.relativePath === 'SKILL.md') {
      const { frontmatter, body } = parseFrontmatter(normalized);
      const outContent = await serializeImportedSkillWithFallback(
        destPath,
        { ...frontmatter, name: skillName },
        body,
      );
      await writeFileAtomic(destPath, outContent);
    } else {
      await writeFileAtomic(destPath, normalized);
    }

    options.results.push({
      fromTool: options.targetName,
      fromPath: entry.absolutePath,
      toPath: `${options.destCanonicalSkillsDir}/${skillName}/${entry.relativePath}`,
      feature: 'skills',
    });
  }
}

/**
 * Import a flat skill file (single .md file → SKILL.md).
 */
export async function importFlatSkill(
  skillName: string,
  srcPath: string,
  content: string,
  options: SkillImportOptions,
): Promise<void> {
  const destSkillDir = join(options.projectRoot, options.destCanonicalSkillsDir, skillName);
  await mkdirp(destSkillDir);

  const destPath = join(destSkillDir, 'SKILL.md');
  const normalized = options.normalize(content, srcPath, destPath);
  const { frontmatter, body } = parseFrontmatter(normalized);

  const outContent = await serializeImportedSkillWithFallback(
    destPath,
    { ...frontmatter, name: skillName },
    body,
  );
  await writeFileAtomic(destPath, outContent);

  options.results.push({
    fromTool: options.targetName,
    fromPath: srcPath,
    toPath: `${options.destCanonicalSkillsDir}/${skillName}/SKILL.md`,
    feature: 'skills',
  });
}

/**
 * Find all directory-structured skills (containing SKILL.md).
 * Returns map of skill name → skill directory path.
 *
 * Skill name = `basename(dirname(SKILL.md))`, so `a/b/SKILL.md` becomes skill `b`, not `a/b`.
 * Nested skills are flattened by name; two skills with the same leaf directory name collide
 * silently (last write wins). All supported target layouts keep skills exactly one level deep
 * (e.g. `.claude/skills/<name>/SKILL.md`), so this constraint is by design — callers must not
 * rely on deeper nesting.
 */
export async function findDirectorySkills(skillsDir: string): Promise<Map<string, string>> {
  const skills = new Map<string, string>();

  try {
    const allFiles = await readDirRecursiveNoSymlinks(skillsDir);
    const skillMdFiles = allFiles.filter((f) => basename(f) === 'SKILL.md');

    for (const skillMdPath of skillMdFiles) {
      const skillDir = dirname(skillMdPath);
      const skillName = basename(skillDir);
      skills.set(skillName, skillDir);
    }
  } catch {
    // Directory doesn't exist or not readable
  }

  return skills;
}

/**
 * Context passed to a `SkillRecognizer.recognize` call when the orchestrator finds a
 * candidate skill directory.
 */
export interface SkillRecognizerContext {
  skillName: string;
  /** Absolute path to the source skill directory. */
  skillDir: string;
  /** Absolute path to the source SKILL.md file. */
  skillMdPath: string;
  /** Raw SKILL.md content (pre-normalize). */
  rawContent: string;
  /** Parsed frontmatter from the raw content. */
  frontmatter: Record<string, unknown>;
  /** Body portion of the raw SKILL.md after frontmatter. */
  rawBody: string;
  options: SkillImportOptions;
}

/**
 * A recognizer that claims SKILL.md candidates whose frontmatter routes them to a non-skill
 * canonical destination (projected agent, command skill, etc.).
 *
 * Contract:
 * - Returning `true` means "I own this skill — do not run further recognizers and do not
 *   call the default `importDirectorySkill` fallback for it." A recognizer that returns
 *   `true` is responsible for writing every canonical artifact this skill should produce
 *   (e.g. the agent/command file, plus any stale-skill-dir cleanup) and for pushing matching
 *   entries to `ctx.options.results`. Returning `true` without writing leaves a hole.
 * - Returning `false` means "not mine" — the orchestrator tries the next recognizer, falling
 *   back to `importDirectorySkill` when none claim.
 */
export interface SkillRecognizer {
  recognize(ctx: SkillRecognizerContext): boolean | Promise<boolean>;
}

/**
 * Orchestrate skill import for a target: walk the configured source directories, parse each
 * SKILL.md, dispatch to recognizers (projected-agent, command-skill, etc.), then fall back to
 * the default directory-skill importer when none apply.
 *
 * Source-dir semantics: directories in `sourceSkillsDirs` are tried in order. The orchestrator
 * stops after the first directory that yields **at least one readable** SKILL.md (a discoverable
 * but unreadable SKILL.md — e.g. broken symlink — counts as "no skills here" so the fallback
 * directory is tried, NOT as a successful import that consumed the slot).
 *
 * Two-stage parse: frontmatter is parsed from RAW SKILL.md content so recognizers can route
 * based on the canonical `x-agentsmesh-kind` markers without seeing path-rewritten text.
 * Each recognizer (and `importDirectorySkill`) is responsible for invoking
 * `options.normalize(content, sourceFile, destinationFile)` with its own final destination
 * path so reference rewriting targets the correct relative-path basis.
 */
export async function importSkillsDirectory(
  sourceSkillsDirs: readonly string[],
  options: SkillImportOptions,
  recognizers: readonly SkillRecognizer[] = [],
): Promise<void> {
  for (const sourceDir of sourceSkillsDirs) {
    const absSkillsDir = join(options.projectRoot, sourceDir);
    const directorySkills = await findDirectorySkills(absSkillsDir);
    if (directorySkills.size === 0) continue;

    // `importedAny` is the "this source dir actually produced output" flag. It is set ONLY
    // after a successful SKILL.md read so unreadable entries (broken symlinks, race-deleted
    // files) do not consume the fallback slot. See the source-dir semantics note above.
    let importedAny = false;
    for (const [skillName, skillDir] of directorySkills) {
      const skillMdPath = join(skillDir, 'SKILL.md');
      const rawContent = await readFileSafe(skillMdPath);
      if (rawContent === null) continue;
      importedAny = true;

      const { frontmatter, body: rawBody } = parseFrontmatter(rawContent);
      const ctx: SkillRecognizerContext = {
        skillName,
        skillDir,
        skillMdPath,
        rawContent,
        frontmatter,
        rawBody,
        options,
      };

      let handled = false;
      for (const recognizer of recognizers) {
        const claimed = await recognizer.recognize(ctx);
        if (claimed) {
          handled = true;
          break;
        }
      }

      if (!handled) {
        await importDirectorySkill(skillName, skillDir, options);
      }
    }

    if (importedAny) return;
  }
}

/**
 * Recognizer that claims SKILL.md files whose frontmatter marks them as projected agents
 * (`x-agentsmesh-kind: agent`). Writes the canonical agent under `canonicalAgentsDir`,
 * pushes an `agents` result entry, and cleans up the stale projected skill directory.
 */
export function projectedAgentRecognizer(config: { canonicalAgentsDir: string }): SkillRecognizer {
  return {
    async recognize(ctx) {
      const projectedAgent = parseProjectedAgentSkillFrontmatter(ctx.frontmatter, ctx.skillName);
      if (!projectedAgent) return false;

      const { options } = ctx;
      await removePathIfExists(
        join(options.projectRoot, options.destCanonicalSkillsDir, ctx.skillName),
      );

      const destAgentsDir = join(options.projectRoot, config.canonicalAgentsDir);
      await mkdirp(destAgentsDir);
      const agentPath = join(destAgentsDir, `${projectedAgent.name}.md`);
      const normalizedBody = options.normalize(ctx.rawBody, ctx.skillMdPath, agentPath);
      await writeFileAtomic(agentPath, serializeImportedAgent(projectedAgent, normalizedBody));

      options.results.push({
        fromTool: options.targetName,
        fromPath: ctx.skillMdPath,
        toPath: `${config.canonicalAgentsDir}/${projectedAgent.name}.md`,
        feature: 'agents',
      });
      return true;
    },
  };
}

/**
 * Recognizer that claims SKILL.md files whose frontmatter marks them as command skills
 * (`x-agentsmesh-kind: command`). Writes the canonical command, pushes a `commands` result
 * entry, and cleans up the stale projected skill directory.
 */
export function commandSkillRecognizer(config: { canonicalCommandsDir: string }): SkillRecognizer {
  return {
    async recognize(ctx) {
      const command = parseCommandSkillFrontmatter(ctx.frontmatter, ctx.skillName);
      if (!command) return false;

      const { options } = ctx;
      await removePathIfExists(
        join(options.projectRoot, options.destCanonicalSkillsDir, ctx.skillName),
      );

      const destCommandsDir = join(options.projectRoot, config.canonicalCommandsDir);
      await mkdirp(destCommandsDir);
      const commandPath = join(destCommandsDir, `${command.name}.md`);
      const normalizedBody = options.normalize(ctx.rawBody, ctx.skillMdPath, commandPath);
      await writeFileAtomic(commandPath, serializeImportedCommand(command, normalizedBody));

      options.results.push({
        fromTool: options.targetName,
        fromPath: ctx.skillMdPath,
        toPath: `${config.canonicalCommandsDir}/${command.name}.md`,
        feature: 'commands',
      });
      return true;
    },
  };
}
