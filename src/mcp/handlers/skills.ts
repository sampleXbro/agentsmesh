import { z } from 'zod';
import { resolve } from 'node:path';
import { readFile, stat, rm } from 'node:fs/promises';
import type { McpContext } from '../context.js';
import { McpError } from '../errors.js';
import { MAX_DIR_ENTRIES } from '../limits.js';
import { parseMd, serializeMd } from '../writers/md-frontmatter.js';
import { assertContainedPath } from '../writers/path-containment.js';
import { skillReadHandlers } from './skills-read.js';
import {
  skillsDir,
  skillDir,
  checkName,
  checkSupportPath,
  assertSkillFile,
  atomicWrite,
  validateSkillFiles,
} from './skill-files.js';

const skillFrontmatter = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
  })
  .passthrough();

export { type SkillSummary } from './skills-read.js';

export const skillsHandlers = {
  ...skillReadHandlers,
  async create(
    ctx: McpContext,
    input: {
      name: string;
      frontmatter: Record<string, unknown>;
      body: string;
      supportingFiles?: Record<string, string>;
      dry_run?: boolean;
    },
  ): Promise<{ path: string; written: boolean; supportingFilesWritten: string[] }> {
    checkName(input.name);
    const dir = skillDir(ctx.projectRoot, input.name);
    // Assert containment BEFORE the existence probe so a symlinked skills tree
    // cannot leak an out-of-project existence oracle via ALREADY_EXISTS.
    await assertContainedPath({
      root: skillsDir(ctx.projectRoot),
      target: dir,
      boundaryRoot: ctx.projectRoot,
      message: 'skill escapes skills directory',
    });
    const parsed = skillFrontmatter.safeParse(input.frontmatter);
    if (!parsed.success) {
      throw new McpError('VALIDATION_FAILED', 'invalid frontmatter', parsed.error.issues);
    }
    let dirExists = false;
    try {
      await stat(dir);
      dirExists = true;
    } catch {
      // missing — good
    }
    if (dirExists) throw new McpError('ALREADY_EXISTS', `skill "${input.name}" exists`);
    const support = input.supportingFiles ?? {};
    const supportPaths = Object.keys(support);
    supportPaths.forEach(checkSupportPath);
    if (supportPaths.length + 1 > MAX_DIR_ENTRIES) {
      throw new McpError('LIMIT_EXCEEDED', `supporting files exceed cap`);
    }
    const nextContent = serializeMd(input.frontmatter, input.body);
    await validateSkillFiles(ctx.projectRoot, dir, nextContent, support);
    if (input.dry_run === true) {
      return { path: dir, written: false, supportingFilesWritten: [] };
    }
    const skillMdPath = resolve(dir, 'SKILL.md');
    await atomicWrite(ctx.projectRoot, dir, skillMdPath, nextContent);
    for (const [p, content] of Object.entries(support)) {
      await atomicWrite(ctx.projectRoot, dir, resolve(dir, p), content);
    }
    return { path: dir, written: true, supportingFilesWritten: supportPaths };
  },

  async update(
    ctx: McpContext,
    input: {
      name: string;
      frontmatter?: Record<string, unknown>;
      body?: string;
      merge?: boolean;
      supportingFiles?: Record<string, string | null>;
      dry_run?: boolean;
    },
  ): Promise<{
    path: string;
    written: boolean;
    supportingFilesAffected: { written: string[]; deleted: string[] };
  }> {
    checkName(input.name);
    const dir = skillDir(ctx.projectRoot, input.name);
    const skillMd = resolve(dir, 'SKILL.md');
    await assertSkillFile(ctx.projectRoot, dir, skillMd);
    let current: { frontmatter: Record<string, unknown>; body: string };
    try {
      const src = await readFile(skillMd, 'utf8');
      current = parseMd(src);
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new McpError('NOT_FOUND', `skill "${input.name}" not found`);
      }
      throw new McpError('IO_ERROR', 'failed to read skill');
    }
    const nextFm =
      input.frontmatter === undefined
        ? current.frontmatter
        : input.merge === true
          ? { ...current.frontmatter, ...input.frontmatter }
          : input.frontmatter;
    const parsed = skillFrontmatter.safeParse(nextFm);
    if (!parsed.success) {
      throw new McpError('VALIDATION_FAILED', 'invalid frontmatter', parsed.error.issues);
    }
    const nextBody = input.body !== undefined ? input.body : current.body;
    const support = input.supportingFiles ?? {};
    Object.keys(support).forEach(checkSupportPath);
    const nextContent = serializeMd(nextFm, nextBody);
    await validateSkillFiles(ctx.projectRoot, dir, nextContent, support);
    const written: string[] = [];
    const deleted: string[] = [];
    if (input.dry_run === true) {
      Object.entries(support).forEach(([p, c]) => (c === null ? deleted : written).push(p));
      return { path: dir, written: false, supportingFilesAffected: { written, deleted } };
    }
    await atomicWrite(ctx.projectRoot, dir, resolve(dir, 'SKILL.md'), nextContent);
    for (const [p, content] of Object.entries(support)) {
      const target = resolve(dir, p);
      if (content === null) {
        try {
          await assertSkillFile(ctx.projectRoot, dir, target);
          await rm(target);
          deleted.push(p);
        } catch (e: unknown) {
          if (e instanceof McpError) throw e;
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        }
      } else {
        await atomicWrite(ctx.projectRoot, dir, target, content);
        written.push(p);
      }
    }
    return { path: dir, written: true, supportingFilesAffected: { written, deleted } };
  },

  async delete(
    ctx: McpContext,
    { name, dry_run }: { name: string; dry_run?: boolean },
  ): Promise<{ path: string; deleted: boolean }> {
    checkName(name);
    const dir = skillDir(ctx.projectRoot, name);
    await assertContainedPath({
      root: skillsDir(ctx.projectRoot),
      target: dir,
      boundaryRoot: ctx.projectRoot,
      message: 'skill escapes skills directory',
    });
    try {
      await stat(dir);
    } catch {
      throw new McpError('NOT_FOUND', `skill "${name}" not found`);
    }
    if (dry_run === true) return { path: dir, deleted: false };
    await rm(dir, { recursive: true });
    return { path: dir, deleted: true };
  },
};
