/**
 * Parse .agentsmesh/skills/{name}/SKILL.md into CanonicalSkill objects.
 */

import { basename, join } from 'node:path';
import { lstat, readdir } from 'node:fs/promises';
import type { CanonicalSkill, SkillSupportingFile } from '../../core/types.js';
import { readFileSafe } from '../../utils/filesystem/fs.js';
import { readDirRecursiveNoSymlinks } from '../../utils/filesystem/fs-traverse.js';
import { parseOrSkipFrontmatter } from '../../utils/text/markdown.js';
import type { ParseFrontmatterOptions } from './rules.js';
import { isNoiseBoilerplate } from '../../install/importers/boilerplate-filter.js';
import { assertCanonicalName } from './validate-name.js';

/** Read file content; returns empty string if unreadable */
async function readContent(path: string): Promise<string> {
  const c = await readFileSafe(path);
  return c ?? '';
}

const SKILL_FILE = 'SKILL.md';

/**
 * SKILL.md content, or null when missing or a symlink: like every other
 * canonical entry (readDirRecursiveNoSymlinks, copyDir), a link is not followed,
 * or it would copy any local file into packs and generated skills.
 */
async function readSkillFile(skillPath: string): Promise<string | null> {
  try {
    if ((await lstat(skillPath)).isSymbolicLink()) return null;
  } catch {
    return null;
  }
  return readFileSafe(skillPath);
}

/** Markdown / plain-text doc filenames the markdown-boilerplate filter applies to. */
const DOC_EXTENSIONS = new Set(['.md', '.mdx', '.rst', '.txt']);

function isMarkdownLikeDoc(name: string): boolean {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return true;
  return DOC_EXTENSIONS.has(name.slice(dot).toLowerCase());
}

/** Directories that are never valid skill supporting content. */
const EXCLUDED_DIR_PREFIXES = ['.git', 'node_modules'];

/** Sanitize a frontmatter name into a valid directory/skill name. */
function sanitizeSkillName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * List supporting files in a skill directory (all files except SKILL.md).
 * @param skillDir - Absolute path to skill directory
 * @returns Supporting files with relative and absolute paths
 */
async function listSupportingFiles(skillDir: string): Promise<SkillSupportingFile[]> {
  // Hardening: do NOT follow symlinks. A malicious skill dir containing
  // `keys -> /Users/victim/.ssh` would otherwise pull external bytes (private
  // keys, etc.) into the canonical skill and through to any pack/tool that
  // later redistributes it.
  const files = await readDirRecursiveNoSymlinks(skillDir);
  const result: SkillSupportingFile[] = [];
  for (const absPath of files) {
    const raw = absPath.slice(skillDir.length + 1);
    const name = raw.replace(/\\/g, '/');
    if (name === SKILL_FILE || name.endsWith(`/${SKILL_FILE}`)) continue;
    const firstSegment = name.split('/')[0]!;
    if (EXCLUDED_DIR_PREFIXES.some((p) => firstSegment === p)) continue;
    if (name === '.DS_Store' || name.endsWith('/.DS_Store')) continue;
    // R-6: skip third-party-repo noise boilerplate (CONTRIBUTING, CHANGELOG,
    // CODE_OF_CONDUCT, …) inside skill subtrees. Preserved files
    // (LICENSE / NOTICE / COPYING / COPYRIGHT for legal attribution; README
    // for skill-specific context) are kept here so license terms travel with
    // redistributed content and the consumer still sees the skill's own docs.
    // The filter is restricted to markdown-like docs so legitimate supporting
    // scripts (e.g. `scripts/changelog.py`) are kept.
    const baseName = name.includes('/') ? name.slice(name.lastIndexOf('/') + 1) : name;
    if (isMarkdownLikeDoc(baseName) && isNoiseBoilerplate(baseName)) continue;
    const content = await readContent(absPath);
    result.push({ relativePath: name, absolutePath: absPath, content });
  }
  return result.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

/**
 * Parse all skill directories under skillsDir.
 * Each skill lives in skillsDir/{name}/SKILL.md.
 * @param skillsDir - Absolute path to .agentsmesh/skills
 * @returns Array of parsed CanonicalSkill, or [] if dir missing/empty
 */
/**
 * Parse a single skill directory containing SKILL.md (Anthropic-style leaf folder).
 */
export async function parseSkillDirectory(
  skillDir: string,
  opts: ParseFrontmatterOptions = {},
): Promise<CanonicalSkill | null> {
  const skillPath = join(skillDir, SKILL_FILE);
  const content = await readSkillFile(skillPath);
  if (!content) return null;
  const parsed = parseOrSkipFrontmatter(content, skillPath, opts.onParseError);
  // SKILL.md frontmatter parse error skips the entire skill directory: a skill
  // with no parseable identity has no canonical shape and partial skills are
  // worse than no skill (per the spec's skill-skip granularity rule).
  if (!parsed) return null;
  const { frontmatter, body } = parsed;
  const supportingFiles = await listSupportingFiles(skillDir);
  const fmName = typeof frontmatter.name === 'string' ? sanitizeSkillName(frontmatter.name) : '';
  const name = fmName || basename(skillDir);
  assertCanonicalName('skill', name);
  return {
    source: skillPath,
    name,
    description: typeof frontmatter.description === 'string' ? frontmatter.description : '',
    body,
    supportingFiles,
  };
}

export async function parseSkills(
  skillsDir: string,
  opts: ParseFrontmatterOptions = {},
): Promise<CanonicalSkill[]> {
  let entries: { name: string; isDirectory: () => boolean }[];
  try {
    entries = await readdir(skillsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const skills: CanonicalSkill[] = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (ent.name.startsWith('_')) continue;
    assertCanonicalName('skill', ent.name);
    const skillDir = join(skillsDir, ent.name);
    const skillPath = join(skillDir, SKILL_FILE);
    const content = await readSkillFile(skillPath);
    if (!content) continue;
    const parsed = parseOrSkipFrontmatter(content, skillPath, opts.onParseError);
    if (!parsed) continue;
    const { frontmatter, body } = parsed;
    const supportingFiles = await listSupportingFiles(skillDir);
    skills.push({
      source: skillPath,
      name: ent.name,
      description: typeof frontmatter.description === 'string' ? frontmatter.description : '',
      body,
      supportingFiles,
    });
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}
