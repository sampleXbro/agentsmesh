import { resolve } from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import type { McpContext } from '../context.js';
import { McpError } from '../errors.js';
import { parseMd } from '../writers/md-frontmatter.js';
import { safeRead } from '../writers/safe-read.js';
import { assertContainedPath } from '../writers/path-containment.js';
import {
  skillsDir,
  skillDir,
  checkName,
  checkSupportPath,
  assertSkillFile,
} from './skill-files.js';

export interface SkillSummary {
  name: string;
  description: string | null;
}

export const skillReadHandlers = {
  async list(ctx: McpContext): Promise<SkillSummary[]> {
    // Reject a symlinked skills tree before enumerating (mirrors canonical list).
    await assertContainedPath({
      root: ctx.projectRoot,
      target: skillsDir(ctx.projectRoot),
      message: 'skills directory escapes project',
    });
    let entries: string[];
    try {
      entries = (await readdir(skillsDir(ctx.projectRoot), { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {
      return [];
    }
    const out: SkillSummary[] = [];
    for (const name of entries) {
      try {
        const dir = skillDir(ctx.projectRoot, name);
        const skillMd = resolve(dir, 'SKILL.md');
        await assertSkillFile(ctx.projectRoot, dir, skillMd);
        const src = await readFile(skillMd, 'utf8');
        const fm = parseMd(src).frontmatter as { description?: string };
        out.push({ name, description: fm.description ?? null });
      } catch {
        // skip incomplete skills (no SKILL.md)
      }
    }
    return out;
  },

  async get(
    ctx: McpContext,
    { name }: { name: string },
  ): Promise<{
    name: string;
    frontmatter: Record<string, unknown>;
    body: string;
    supportingFiles: string[];
  }> {
    checkName(name);
    const dir = skillDir(ctx.projectRoot, name);
    const skillMd = resolve(dir, 'SKILL.md');
    await assertSkillFile(ctx.projectRoot, dir, skillMd);
    try {
      const src = await readFile(skillMd, 'utf8');
      const { frontmatter, body } = parseMd(src);
      const all = await readdir(dir);
      const supportingFiles = all.filter((f) => f !== 'SKILL.md').sort();
      return { name, frontmatter, body, supportingFiles };
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new McpError('NOT_FOUND', `skill "${name}" not found`);
      }
      throw new McpError('IO_ERROR', 'failed to read skill');
    }
  },

  async getFile(
    ctx: McpContext,
    { name, path }: { name: string; path: string },
  ): Promise<{ content: string; encoding: 'utf-8' }> {
    checkName(name);
    checkSupportPath(path);
    return {
      content: await safeRead({ projectRoot: ctx.projectRoot, skillName: name, filePath: path }),
      encoding: 'utf-8',
    };
  },
};
